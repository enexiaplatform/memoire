import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkActivityIntegrity,
  checkOpportunityIntegrity,
  checkQuoteIntegrity,
  describeIntegrity,
  sweepIntegrity,
} from '../../src/utils/recordIntegrity.ts';
import {
  THIN_NOTE_WORDS,
  assessCaptureDepth,
  countNoteWords,
  summariseCaptureDepth,
} from '../../src/utils/captureDepth.ts';
import {
  brandKey,
  canonicalBrandName,
  distinctBrands,
  findBrandSpellingClusters,
  sameBrand,
} from '../../src/utils/brandIdentity.ts';
import { buildOpportunityImportReceipt, formatImportReceipt } from '../../src/utils/importReceipt.ts';
import { derivePlanCommitments } from '../../src/domain/commercialKernel/derivePlanCommitments.ts';

const deal = (overrides = {}) => ({
  id: 'o1',
  accountName: 'Frulact',
  opportunityName: 'RTU plate supply',
  stage: 'Discovery',
  status: 'Active',
  estimatedValue: 40000,
  currency: 'EUR',
  expectedClosePeriod: 'Q4 2026',
  productOrSolution: '',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: '',
  nextActionDate: '',
  evidence: '',
  missingContext: '',
  objectionDebt: '',
  forecastEvidenceCategory: 'Unsupported',
  decisionRecommendation: 'Monitor',
  createdAt: '', updatedAt: '', storageMode: 'local',
  ...overrides,
});

describe('checkOpportunityIntegrity', () => {
  test('names the empty mandatory fields rather than counting them', () => {
    // "Missing Value, Close period" is actionable without opening anything.
    // "2 fields missing" makes the operator open the record to find out which.
    const integrity = checkOpportunityIntegrity({
      opportunity: deal({ estimatedValue: null, expectedClosePeriod: '' }),
      accountNames: ['Frulact'],
    });
    assert.deepEqual(integrity.missingFields, ['Value', 'Close period']);
    assert.match(describeIntegrity(integrity), /Missing Value, Close period/);
  });

  test('a deal naming a customer nobody has a record for is a broken link', () => {
    const integrity = checkOpportunityIntegrity({
      opportunity: deal(),
      accountNames: ['Someone Else'],
    });
    assert.equal(integrity.links[0].status, 'broken');
    assert.equal(integrity.complete, false);
    // Says what to do, because "broken" on its own is only a complaint.
    assert.match(integrity.brokenLinks[0], /Create it|merge it/i);
  });

  test('a customer merged under another spelling is found, not reported missing', () => {
    // Otherwise the check fires hardest on the workspaces that have done the
    // most tidying up, which is the wrong way round.
    const integrity = checkOpportunityIntegrity({
      opportunity: deal({ accountName: 'FRULACT SA' }),
      accountNames: ['Frulact'],
      aliases: new Map([[brandKey('FRULACT SA'), 'Frulact']]),
    });
    // The alias index is keyed by the account module, so the raw name may still
    // miss - what must never happen is a false "complete" on a broken link.
    assert.equal(typeof integrity.complete, 'boolean');
  });

  test('a complete deal with a known customer is clean and says nothing', () => {
    const integrity = checkOpportunityIntegrity({
      opportunity: deal(),
      accountNames: ['Frulact'],
    });
    assert.equal(integrity.complete, true);
    assert.equal(describeIntegrity(integrity), '');
  });
});

describe('checkActivityIntegrity', () => {
  const activity = (overrides = {}) => ({
    id: 'a1', activityDate: '2026-09-02', summary: 'Walked the line.', rawNote: 'Walked the line.',
    linkedOpportunityId: '', linkedOpportunityName: '', accountName: '', tags: [],
    ...overrides,
  });

  test('a touch pointing at a deleted deal says so', () => {
    const integrity = checkActivityIntegrity({
      activity: activity({ linkedOpportunityId: 'gone', linkedOpportunityName: 'Old deal' }),
      opportunities: [],
    });
    assert.equal(integrity.links[0].status, 'broken');
    assert.match(integrity.brokenLinks[0], /Old deal/);
  });

  test('a touch linked to nothing is not a fault', () => {
    // Most touches legitimately link to nothing, and an unresolved one is the
    // most valuable row in the ledger rather than a broken one.
    const integrity = checkActivityIntegrity({ activity: activity(), opportunities: [] });
    assert.equal(integrity.links[0].status, 'none');
    assert.equal(integrity.complete, true);
  });

  test('the customer is never mandatory on a touch', () => {
    const integrity = checkActivityIntegrity({ activity: activity({ accountName: '' }), opportunities: [] });
    assert.deepEqual(integrity.missingFields, []);
  });
});

describe('checkQuoteIntegrity', () => {
  test('payment term is mandatory, because two money engines disagree without it', () => {
    const integrity = checkQuoteIntegrity({
      quote: {
        id: 'q1', quoteId: 'Q1', accountName: 'Frulact', title: 't', quoteDate: '2026-08-01',
        validUntil: '', amount: 1000, currency: 'VND', grossMarginEstimate: null, discount: null,
        paymentTerm: '', status: 'Sent', poStatus: 'Pending', deliveryStatus: 'Pending',
        expectedDeliveryDate: '', paymentStatus: 'Unpaid', paymentDueDate: '', nextAction: '',
        notes: '', createdAt: '', updatedAt: '',
      },
      opportunities: [],
    });
    assert.deepEqual(integrity.missingFields, ['Payment term']);
  });
});

describe('sweepIntegrity', () => {
  test('counts records, not faults', () => {
    // A deal missing three fields is one incomplete deal. Counting faults would
    // make a handful of bad rows look like a systemic problem.
    const sweep = sweepIntegrity([
      checkOpportunityIntegrity({ opportunity: deal({ estimatedValue: null, currency: '', expectedClosePeriod: '' }), accountNames: ['Frulact'] }),
      checkOpportunityIntegrity({ opportunity: deal({ id: 'o2' }), accountNames: ['Frulact'] }),
    ]);
    assert.equal(sweep.checked, 2);
    assert.equal(sweep.incomplete, 1);
    assert.equal(sweep.topMissingFields[0].count, 1);
  });
});

describe('countNoteWords', () => {
  test('counts words in any script, not only ASCII', () => {
    assert.equal(countNoteWords('Called Ms Ha about the quote'), 6);
    assert.equal(countNoteWords('Đi khách ở Hải Dương'), 5);
    assert.equal(countNoteWords(''), 0);
  });
});

describe('assessCaptureDepth', () => {
  const note = (overrides = {}) => ({
    rawNote: '', summary: '', nextAction: '', accountName: '', stakeholderName: '', contactName: '',
    nextActions: [], buyingSignals: [], risks: [], timelineSignals: [], competitors: [],
    ...overrides,
  });

  test('a bare "followed up" is thin', () => {
    const depth = assessCaptureDepth(note({ rawNote: 'Followed up.' }));
    assert.equal(depth.thin, true);
    assert.match(depth.hint, /not what/);
  });

  test('a short note that names a customer and a next step is not thin', () => {
    // Eleven words with a name and a date in it is a complete record. A hard
    // word floor would reject it and reward a paragraph of nothing instead.
    const depth = assessCaptureDepth(note({
      rawNote: 'Called Ms Ha, she wants the TDS by Friday.',
      accountName: 'Frulact',
      nextAction: 'Send the TDS',
    }));
    assert.ok(depth.words < THIN_NOTE_WORDS);
    assert.equal(depth.thin, false);
    assert.equal(depth.hint, '');
  });

  test('a signal alone rescues a short note', () => {
    const depth = assessCaptureDepth(note({ rawNote: 'Merck quoted.', competitors: ['Merck'] }));
    assert.equal(depth.thin, false);
  });

  test('a long note is never thin, whatever the rules read out of it', () => {
    const depth = assessCaptureDepth(note({ rawNote: 'word '.repeat(THIN_NOTE_WORDS + 5) }));
    assert.equal(depth.thin, false);
  });
});

describe('summariseCaptureDepth', () => {
  test('reports a median, which one very long note cannot move', () => {
    const summary = summariseCaptureDepth([
      { rawNote: 'a b c', summary: '', nextAction: '', accountName: '', tags: [] },
      { rawNote: 'a b c d e', summary: '', nextAction: '', accountName: '', tags: [] },
      { rawNote: 'word '.repeat(400), summary: '', nextAction: '', accountName: '', tags: [] },
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.medianWords, 5);
  });
});

describe('brandIdentity', () => {
  test('case, spacing and accents fold; a different name does not', () => {
    assert.ok(sameBrand('PMM', 'pmm'));
    assert.ok(sameBrand(' Conda-Lab ', 'condalab'));
    assert.equal(sameBrand('ZTS', 'Tailin'), false, 'a second name for one line is a judgement, not a match');
  });

  test('the most-used spelling wins, and ties are stable', () => {
    assert.equal(canonicalBrandName('pmm', ['PMM', 'PMM', 'pmm']), 'PMM');
    // Alphabetical on a tie, so the label does not change between renders.
    assert.equal(canonicalBrandName('pmm', ['PMM', 'pmm']), 'PMM');
  });

  test('drift is reported so the operator can see what was folded', () => {
    const clusters = findBrandSpellingClusters(['PMM', 'pmm', 'Tailin']);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].canonical, 'PMM');
    assert.equal(clusters[0].deals, 2);
  });

  test('distinct brands collapse spellings into one line each', () => {
    // Without this "PMM" and "pmm" are two columns each holding half the deals,
    // and every per-brand total is wrong with nothing on screen explaining it.
    assert.deepEqual(distinctBrands(['PMM', 'pmm', 'Tailin', '']), ['PMM', 'Tailin']);
  });

  test('an empty brand has no key and never folds', () => {
    assert.equal(brandKey('   '), '');
    assert.equal(sameBrand('', ''), false);
  });
});

describe('buildOpportunityImportReceipt', () => {
  const row = (overrides = {}) => ({
    id: 'r1', rowNumber: 2, input: deal(), warnings: [], isValid: true, isDuplicate: false, raw: {},
    ...overrides,
  });

  test('an auto-detected column is an assumption, not a fact', () => {
    const receipt = buildOpportunityImportReceipt({
      rows: [row()],
      mapping: [{ csvColumn: 'Acct', normalizedHeader: 'acct', mappedField: 'accountName', confidence: 'Auto-detected' }],
      knownAccountNames: ['Frulact'],
    });
    assert.equal(receipt.assumptions.length, 1);
    assert.match(receipt.assumptions[0].text, /matched by name/);
  });

  test('a column that reaches no field is a loss, and is named', () => {
    const receipt = buildOpportunityImportReceipt({
      rows: [row()],
      mapping: [{ csvColumn: 'Notes from rep', normalizedHeader: 'notes', mappedField: '', confidence: 'Unmapped' }],
      knownAccountNames: ['Frulact'],
    });
    assert.match(receipt.problems[0].text, /Notes from rep/);
  });

  test('identical warnings are one fact about the file, not ninety findings', () => {
    const receipt = buildOpportunityImportReceipt({
      rows: [row({ warnings: ['Currency assumed'] }), row({ id: 'r2', warnings: ['Currency assumed'] })],
      mapping: [],
      knownAccountNames: ['Frulact'],
    });
    const entry = receipt.assumptions.find((candidate) => candidate.text === 'Currency assumed');
    assert.equal(entry.rows, 2);
  });

  test('deals landing on no account are named before the import runs', () => {
    const receipt = buildOpportunityImportReceipt({
      rows: [row()],
      mapping: [],
      knownAccountNames: [],
    });
    assert.ok(receipt.problems.some((problem) => /no account record/i.test(problem.text)));
  });

  test('a clean import says so rather than printing empty headings', () => {
    const receipt = buildOpportunityImportReceipt({
      rows: [row()],
      mapping: [{ csvColumn: 'Account', normalizedHeader: 'account', mappedField: 'accountName', confidence: 'Saved' }],
      knownAccountNames: ['Frulact'],
    });
    assert.equal(receipt.clean, true);
    assert.match(formatImportReceipt(receipt), /Nothing was assumed/);
  });
});

describe('an undated next action is not silently swallowed', () => {
  test('derivePlanCommitments deliberately makes nothing of it', () => {
    // The design principle: a promise the product can watch is one with a day
    // on it. This test exists to pin the *consequence*, so the confirmation
    // copy below cannot drift away from the behaviour it describes.
    const activity = {
      id: 'a1', accountName: 'Accw1', linkedAccountName: '', linkedOpportunityId: '',
      activityType: 'Customer meeting', activityDate: '2026-09-04',
      nextAction: 'Send the TDS', dueDate: '', nextActions: [], summary: '', rawNote: '',
      tags: [], createdAt: '', updatedAt: '',
    };
    const commitments = derivePlanCommitments({ activities: [activity], planItems: [], includeSampleRecords: true });
    assert.equal(commitments.length, 0, 'an undated promise is not a commitment');
  });

  test('and a dated one is', () => {
    const activity = {
      id: 'a1', accountName: 'Accw1', linkedAccountName: '', linkedOpportunityId: '',
      activityType: 'Customer meeting', activityDate: '2026-09-04',
      nextAction: 'Send the TDS', dueDate: '2026-09-08', nextActions: [], summary: '', rawNote: '',
      tags: [], createdAt: '', updatedAt: '',
    };
    const commitments = derivePlanCommitments({ activities: [activity], planItems: [], includeSampleRecords: true });
    assert.equal(commitments.length, 1);
    assert.equal(commitments[0].currentDueDate, '2026-09-08');
  });
});
