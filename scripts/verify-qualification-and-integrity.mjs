import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOCKING_ELEMENTS,
  EFFORT_GATE,
  FORECAST_GATE,
  QUALIFICATION_ELEMENTS,
  scoreDealQualification,
} from '../src/utils/dealQualificationScore.ts';
import { buildCoverage } from '../src/domain/commercialKernel/forecast.ts';
import { checkOpportunityIntegrity, describeIntegrity } from '../src/utils/recordIntegrity.ts';
import { assessCaptureDepth } from '../src/utils/captureDepth.ts';
import { canonicalBrandName, sameBrand } from '../src/utils/brandIdentity.ts';
import { buildOpportunityImportReceipt } from '../src/utils/importReceipt.ts';

// Nine mechanisms lifted from a distributor's tracking workbook. Each one
// answers a question Memoire could not answer before, and each has a way of
// failing quietly. These pin the parts that would rot without a word of warning.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * A file with its comments removed.
 *
 * Every assertion below that asks whether the *code* does something has to read
 * this rather than the raw source. A block comment explaining why a file avoids
 * `localeCompare` contains the word `localeCompare`, and a `doesNotMatch`
 * against the raw text fails on the explanation - the same trap in reverse from
 * the one where a comment satisfies a `match` and the call site is long gone.
 */
const codeOf = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const deal = (overrides = {}) => ({
  id: 'o1', accountName: 'Frulact', opportunityName: 'RTU plates', stage: 'Discovery',
  status: 'Active', estimatedValue: 40000, currency: 'VND', expectedClosePeriod: 'Q4 2026',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Unsupported', decisionRecommendation: 'Monitor',
  createdAt: '', updatedAt: '', storageMode: 'local', ...overrides,
});

// 1. The scorecard keeps its shape. Nine elements, a maximum of 32, and the two
//    that block at zero are the two that carry the most weight. Change any of
//    those silently and every score in the app moves without anybody being told.
{
  assert.equal(QUALIFICATION_ELEMENTS.length, 9, 'nine elements, not seven');
  assert.equal(
    QUALIFICATION_ELEMENTS.reduce((total, element) => total + element.weight * 2, 0),
    32,
    'the maximum is 32',
  );
  assert.deepEqual(BLOCKING_ELEMENTS, ['champion', 'economicBuyer']);
  BLOCKING_ELEMENTS.forEach((key) => {
    assert.equal(
      QUALIFICATION_ELEMENTS.find((element) => element.key === key).weight,
      3,
      `${key} carries the top weight`,
    );
  });

  // Two gates, and the money one is stricter. Collapsing them would either mark
  // a good month of prospecting as failure or let a soft deal back a forecast.
  assert.equal(FORECAST_GATE, 0.75);
  assert.equal(EFFORT_GATE, 0.5);
  assert.ok(FORECAST_GATE > EFFORT_GATE);
}

// 2. Nothing is hand-graded.
//
//    The whole reason this exists is that the believability card read a field
//    somebody had to grade, nobody had graded it, and it drew the entire
//    pipeline as one bar. A score with a setter would be that bug again, and
//    the first use of an override would be making a weak deal look strong before
//    a review.
{
  const source = read('src/utils/dealQualificationScore.ts');
  assert.doesNotMatch(source, /\boverride\s*[?]?:/, 'the score takes no override field');
  assert.doesNotMatch(source, /localStorage|saveTo|persist/i, 'the score is derived, never stored');

  const empty = scoreDealQualification({ opportunity: deal() });
  assert.equal(empty.max, 32, 'a deal the app knows nothing about still scores out of 32');
  assert.equal(empty.backsForecast, false);
}

// 3. An unscored workspace backs nothing.
//
//    Defaulting unscored deals to "qualified" would let an empty book claim
//    full forecast cover, which is the exact reassurance this check exists to
//    withhold - and it would fail in the safest-looking direction.
{
  const report = buildCoverage({
    opportunities: [deal({ stage: 'Negotiation', quarterValues: { Q4: 60000 }, pipelineProbability: 90 })],
    threads: [],
    targets: [{ quarter: 'Q4', amount: 100000 }],
    today: new Date('2026-11-15T00:00:00Z'),
  });
  const q4 = report.quarters.find((quarter) => quarter.quarter === 'Q4');
  assert.equal(q4.qualifiedPipeline, 0, 'an unscored deal backs nothing');
  assert.equal(q4.unbackedTarget, 100000);
  assert.equal(report.unbackedQuarters, 1);

  // And a quarter with no target is not reported as short of one.
  const untargeted = buildCoverage({
    opportunities: [deal({ quarterValues: { Q4: 60000 } })],
    threads: [],
    targets: [],
    today: new Date('2026-11-15T00:00:00Z'),
  });
  assert.equal(untargeted.unbackedValue, 0, 'no target means no shortfall, not a passing grade');
}

// 4. Integrity names fields; it never reports a percentage.
//
//    A percentage tells an operator how they are doing. A list of names tells
//    them what to type, which is the only one of the two that produces an edit.
{
  const integrity = checkOpportunityIntegrity({
    opportunity: deal({ estimatedValue: null, expectedClosePeriod: '' }),
    accountNames: ['Frulact'],
  });
  assert.deepEqual(integrity.missingFields, ['Value', 'Close period']);
  const described = describeIntegrity(integrity);
  assert.match(described, /Missing Value, Close period/);
  assert.doesNotMatch(described, /\d+\s*%/, 'integrity never reports a completeness percentage');

  // A deal naming a customer with no record is a broken link, and the message
  // says what to do rather than only that something is wrong.
  const orphan = checkOpportunityIntegrity({ opportunity: deal(), accountNames: [] });
  assert.equal(orphan.links[0].status, 'broken');
  assert.match(orphan.brokenLinks[0], /Create it|merge it/i);

  /*
   * And the check is not fed a list that contains its own answer.
   *
   * `knownAccountNames` folds in every name typed onto a deal, so the form can
   * offer a spelling already in use. Passed to the integrity check it makes the
   * check tautological: the deal's own customer name is in the list, the link
   * always resolves, and the one thing this was built to catch can never fire.
   * It shipped that way for an hour and only the running app showed it.
   */
  const page = codeOf('src/features/opportunities/OpportunitiesPage.tsx');
  assert.match(
    page,
    /accountNames: accountRecordNames/,
    'the broken-link check reads account records, never the typeahead union',
  );
  assert.doesNotMatch(
    page,
    /accountNames: knownAccountNames/,
    'knownAccountNames contains names taken from deals and would pass on itself',
  );
}

// 5. The alias basis survives its own store.
//
//    `sanitize` rebuilds a merge record field by field, so a field missing from
//    it is deleted on the next write - the trap `sanitizePlanRecord` already
//    fell into once with the activity channel.
{
  const store = read('src/services/accountMergeStore.ts');
  const sanitizer = store.slice(store.indexOf('function sanitize'));
  assert.match(sanitizer, /basis: candidate\.basis === 'confirmed'/, 'basis is carried through the sanitizer');
  assert.match(sanitizer, /basisNote: typeof candidate\.basisNote === 'string'/, 'so is the note behind it');

  // A merge accepted from a "likely" suggestion is recorded as assumed, not as
  // confirmed - the whole point is that a reading and a match stay different
  // facts six months later.
  const page = read('src/features/accounts/AccountsPage.tsx');
  assert.match(
    page,
    /basis: group\.confidence === 'certain' \? 'confirmed' : 'assumed'/,
    'the merge records what it rests on',
  );
}

// 6. A thin note is short AND empty, never merely short.
//
//    A hard word floor measures typing rather than information, and its fastest
//    workaround is a paragraph of nothing - which passes the check and leaves
//    the ledger worse than the three honest words it replaced.
{
  const bare = assessCaptureDepth({ rawNote: 'Followed up.', summary: '', nextAction: '', accountName: '' });
  assert.equal(bare.thin, true);

  const short = assessCaptureDepth({
    rawNote: 'Called Ms Ha, she wants the TDS by Friday.',
    summary: '', nextAction: 'Send the TDS', accountName: 'Frulact',
  });
  assert.equal(short.thin, false, 'a short note carrying a customer and a next step is a complete record');

  // Nothing is blocked. A capture refused for being short is a capture that
  // never happens, and an empty ledger is worse than a thin one.
  const capture = codeOf('src/features/dailyCapture/DailyCapturePage.tsx');
  assert.match(capture, /depth\.thin && \(/, 'the thin-note hint is shown');
  assert.doesNotMatch(capture, /depth\.thin\s*\)\s*return;/, 'and never used to refuse a save');
}

// 7. Brands fold on spelling, never on similarity - and the tie-break does not
//    depend on the runtime's locale.
{
  assert.ok(sameBrand('PMM', ' pmm '), 'case and spacing are not a decision');
  assert.equal(sameBrand('ZTS', 'Tailin'), false, 'a second name for one line is a judgement, not a match');
  assert.equal(canonicalBrandName('pmm', ['PMM', 'pmm']), 'PMM', 'a capitalised spelling wins a tie');

  const source = codeOf('src/utils/brandIdentity.ts');
  assert.doesNotMatch(
    source, /localeCompare/,
    'sorting must be locale-independent, or the same book renders differently on two machines',
  );
}

// 8. The import receipt is shown before the import runs.
//
//    "Please confirm" after the fact is not a question. One inch mark in a
//    product name once swallowed every row beneath it and the import still
//    reported success; a receipt would have said so.
{
  const receipt = buildOpportunityImportReceipt({
    rows: [{ id: 'r1', rowNumber: 2, input: deal(), warnings: [], isValid: true, isDuplicate: false, raw: {} }],
    mapping: [{ csvColumn: 'Acct', normalizedHeader: 'acct', mappedField: 'accountName', confidence: 'Auto-detected' }],
    knownAccountNames: [],
  });
  assert.ok(receipt.assumptions.length > 0, 'an auto-detected column is an assumption');
  assert.ok(
    receipt.problems.some((problem) => /no account record/i.test(problem.text)),
    'deals that will land on nothing are named before the import, not discovered after',
  );

  const page = read('src/features/opportunities/OpportunitiesPage.tsx');
  assert.match(page, /buildOpportunityImportReceipt\(\{/, 'the panel builds the receipt');
  assert.match(page, /Assumed — please confirm/, 'and shows what it assumed');
  assert.match(page, /Problems in the file — named, not fixed/, 'and what was already wrong');
}

// 9. A field the operator cannot type says so.
//
//    Somebody who tries to correct a derived score and finds no field concludes
//    the app is broken, rather than that the number is a reading of their own
//    records.
{
  const ownership = read('src/components/common/FieldOwnership.tsx');
  assert.match(ownership, /owner === 'you'\) return null/, 'the ordinary case is never marked');

  const deals = read('src/features/opportunities/OpportunitiesPage.tsx');
  assert.match(deals, /<FieldOwnership owner="derived"/, 'the qualification score is marked derived');

  const drawer = read('src/features/plan/PlanItemDetailDrawer.tsx');
  assert.match(drawer, /<FieldOwnership owner="elsewhere"/, 'a locked field says where it actually lives');
}

console.log('Qualification, integrity and import-receipt contract OK');
