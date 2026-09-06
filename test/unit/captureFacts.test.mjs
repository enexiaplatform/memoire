import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture } from '../../src/domain/commercialKernel/parseCapture.ts';
import { capturedFactKinds } from '../../src/domain/commercialKernel/capturedFacts.ts';
import { objectionTypes } from '../../src/services/objectionStore.ts';
import { commitCapturedFacts } from '../../src/domain/commercialKernel/commitCapturedFacts.ts';

/*
 * The parser proposes; the operator decides.
 *
 * These tests are as much about what the parser must NOT say as about what it
 * reads. "John attended" is not "John approves the budget", "maybe 400M" is not
 * a contractual figure, and a meeting date is not a close date. Each of those is
 * a sentence the product would be believed about, and each of them would be a
 * lie told with a straight face.
 */

const CAPTURE_DATE = '2026-09-05'; // A Saturday, so "Friday" is unambiguous.
const ACCOUNT = 'Rohto Vietnam';

const context = (patch = {}) => ({
  accounts: [{ id: 'acct-1', accountName: ACCOUNT }],
  opportunities: [{
    id: 'opp-1', accountName: ACCOUNT, opportunityName: 'QC analyser rollout',
    productOrSolution: 'Analyser', stage: 'Proposal', currency: 'VND', estimatedValue: 300_000_000,
  }],
  objections: [],
  stakeholders: [],
  openCommitments: [],
  evidence: [],
  reportingCurrency: 'VND',
  ...patch,
});

const parse = (rawCapture, patch = {}) => parseCapture({
  rawCapture, captureDate: CAPTURE_DATE, context: context(patch),
});

const kinds = (result) => result.facts.map((fact) => fact.kind);
const of = (result, kind) => result.facts.filter((fact) => fact.kind === kind);

describe('parseCapture - one messy note, several facts', () => {
  const NOTE = 'Met Rohto QC today. Trial looks good but they still need clarification on GPT '
    + 'verification. Purchasing wants to decide before Sep 20. Likely PO around 400M. '
    + 'Marc will visit Oct 3. I promised to send the validation explanation by Friday.';

  test('1. the brief\'s own note produces several distinct commercial facts', () => {
    const result = parse(NOTE);

    assert.ok(result.facts.length >= 4, `expected several facts, got ${result.facts.length}`);
    for (const kind of ['objection', 'commitment', 'opportunity_value', 'scheduled_event']) {
      assert.ok(kinds(result).includes(kind), `no ${kind} proposed from the note`);
    }
    // Every fact carries the words it came from.
    for (const fact of result.facts) {
      assert.ok(fact.evidence.trim().length > 0, `${fact.kind} proposed with no evidence`);
      assert.ok(NOTE.includes(fact.evidence.slice(0, 25)), `${fact.kind} evidence is not from the note`);
    }
  });

  test('2. and 3. it resolves the customer and the deal it is about', () => {
    const result = parse(NOTE);
    assert.equal(result.target.accountName, ACCOUNT);
    assert.equal(result.target.opportunityId, 'opp-1', 'the account\'s only open deal is not a guess');
  });

  test('8. my own promise is mine, with the date I gave it', () => {
    const mine = of(parse(NOTE), 'commitment').find((fact) => fact.party === 'self');
    assert.ok(mine, 'the note plainly contains a promise the seller made');
    assert.match(mine.text, /validation explanation/i);
    assert.equal(mine.dueDate, '2026-09-11', 'the Friday after a Saturday note');
    assert.equal(mine.certainty, 'exact', '"I promised" needs no inference');
  });

  test('9. and 11. a customer saying when they will decide is a customer commitment', () => {
    const theirs = of(parse(NOTE), 'commitment').find((fact) => fact.party === 'customer');
    assert.ok(theirs, 'the decision intent must be recorded as something owed by them');
    assert.equal(theirs.ownerLabel, 'Purchasing');
    assert.equal(theirs.dueDate, '2026-09-20');
    assert.equal(theirs.certainty, 'inferred', 'an intention is not an agreement');
  });

  test('12. an approximate amount is an amount, and says it is approximate', () => {
    const [value] = of(parse(NOTE), 'opportunity_value');
    assert.ok(value);
    assert.equal(value.amount, 400_000_000);
    assert.equal(value.currency, 'VND', 'from the deal it belongs to');
    assert.equal(value.approximate, true);
    assert.equal(value.certainty, 'inferred');
  });

  test('a dated visit becomes a scheduled event, not a commitment', () => {
    const [event] = of(parse(NOTE), 'scheduled_event');
    assert.ok(event);
    assert.equal(event.date, '2026-10-03');
    assert.ok(
      !of(parse(NOTE), 'commitment').some((fact) => /Marc/i.test(fact.ownerLabel)),
      'Marc visiting is something happening, not something Marc owes you',
    );
  });

  // Phase 3 recorded this as an honest gap: the note plainly said the trial
  // went well and there was nowhere truthful to put it, so it was listed as
  // unsupported rather than bent into the deal's free-text evidence box. Phase
  // 3.1 built the destination - one bounded Commercial Evidence record - so the
  // assertion moves with the model. What has not moved is the rule underneath
  // it: a finding may only become a fact when a canonical home already exists,
  // and the parser still invents no record type of its own.
  test('15. a trial result now has a canonical home, and still no invented type', () => {
    const result = parse(NOTE);

    const finding = result.facts.find((fact) => fact.kind === 'commercial_evidence');
    assert.ok(finding, 'the trial result should now be a proposed finding');
    assert.equal(finding.category, 'technical_outcome');
    assert.equal(finding.status, 'proposed', 'and still written only after the operator accepts');
    assert.ok(
      finding.evidence.includes('Trial looks good'),
      'carrying the sentence it was read from',
    );

    assert.ok(
      !result.unsupported.some((item) => item.label === 'Trial result'),
      'and is no longer reported as having nowhere to go',
    );
    assert.ok(
      !kinds(result).includes('signal'),
      'no record type was invented to hold it',
    );
  });

  test('38. the same note and reference date parse identically every time', () => {
    assert.equal(JSON.stringify(parse(NOTE)), JSON.stringify(parse(NOTE)));
  });

  test('36. the raw note is preserved exactly', () => {
    const padded = `  ${NOTE}  `;
    assert.equal(parse(padded).rawCapture, padded, 'never trimmed, never rewritten');
  });
});

describe('parseCapture - honesty', () => {
  test('39. being in the room is not authority', () => {
    const result = parse('Met John Pham from purchasing today. Good discussion.');
    const [person] = of(result, 'stakeholder');
    assert.ok(person, 'the person is worth recording');
    assert.equal(person.name, 'John Pham');
    assert.equal(person.roleTitle, 'purchasing', 'the title he was given, as written');
    assert.equal(
      Object.prototype.hasOwnProperty.call(person, 'stakeholderRole'),
      false,
      'the parser has no opinion about the MEDDIC role, and no field to put one in',
    );
    assert.equal(
      /champion|economic buyer|decision maker/i.test(JSON.stringify(result)),
      false,
      'attendance must never be written up as decision authority',
    );
  });

  test('40. "maybe 400M" is not an exact contractual value', () => {
    const vague = of(parse('Deal maybe 400M.'), 'opportunity_value')[0];
    assert.equal(vague.approximate, true);

    const stated = of(parse('PO value is 400,000,000 VND.'), 'opportunity_value')[0];
    assert.equal(stated.approximate, false);
    assert.equal(stated.certainty, 'exact');
    assert.equal(stated.amount, 400_000_000);
  });

  test('41. the day the meeting happened does not become a deal date', () => {
    const result = parse('Met them on Sep 3. Nothing else agreed.');
    assert.deepEqual(of(result, 'scheduled_event'), [], 'a past meeting is not a scheduled event');
    assert.deepEqual(of(result, 'opportunity_value'), []);
  });

  test('14. a bare quantity is not money', () => {
    assert.deepEqual(of(parse('They asked about 400 units of the filter.'), 'opportunity_value'), []);
    assert.deepEqual(of(parse('We shipped 12 analysers.'), 'opportunity_value'), []);
  });

  test('13. an amount with no currency anywhere is ambiguous, not assumed', () => {
    const noDeal = parse('Likely PO around 400M.', { opportunities: [] });
    const [value] = of(noDeal, 'opportunity_value');
    assert.ok(value);
    assert.equal(value.certainty, 'ambiguous', 'nothing in the note or the record names a currency');
    assert.equal(value.currency, 'VND', 'the workspace default is offered, and flagged for review');
  });

  test('a note with nothing structured in it proposes nothing', () => {
    const result = parse('Dropped by the plant. Nobody available. Will try again.');
    assert.deepEqual(of(result, 'objection'), []);
    assert.deepEqual(of(result, 'opportunity_value'), []);
    assert.deepEqual(of(result, 'scheduled_event'), []);
  });

  test('every fact kind the parser can emit is a declared kind', () => {
    const result = parse(
      'Met Anna Vu from QC. They are worried about lead time. Purchasing will confirm by Sep 20. '
      + 'Deal around 900M VND. Anna Vu will visit Oct 9. I will send the report Friday.',
    );
    for (const fact of result.facts) {
      assert.ok(capturedFactKinds.includes(fact.kind), `undeclared fact kind: ${fact.kind}`);
      assert.ok(['proposed', 'already_recorded'].includes(fact.status),
        'a freshly parsed fact is never pre-accepted');
    }
  });
});

describe('parseCapture - taxonomy and classification', () => {
  test('7. objections classify through the shared taxonomy', () => {
    const price = of(parse('They are worried the price is too expensive for this year.'), 'objection')[0];
    assert.ok(price);
    assert.ok(objectionTypes.includes(price.objectionType), 'an objection type outside the shared list');

    const technical = of(parse('QC still need clarification on GPT verification.'), 'objection')[0];
    assert.ok(technical);
    assert.ok(objectionTypes.includes(technical.objectionType));
  });

  test('4. a department is not a person', () => {
    const result = parse('Met QC today and spoke to Purchasing afterwards.');
    for (const person of of(result, 'stakeholder')) {
      assert.ok(!/^(qc|purchasing)$/i.test(person.name), `${person.name} is a team, not somebody`);
    }
  });

  test('10. an internal promise is not the customer\'s', () => {
    const result = parse('Our technical team will prepare the validation pack by Sep 18.');
    const commitment = of(result, 'commitment')[0];
    assert.ok(commitment);
    assert.equal(commitment.party, 'internal');
  });

  test('an unattributable promise stays yours rather than becoming theirs', () => {
    const commitment = of(parse('Send the revised layout by Sep 18.'), 'commitment')[0];
    assert.ok(commitment);
    assert.equal(commitment.party, 'self',
      'a promise wrongly filed as the customer\'s makes Memoire tell you to wait for nobody');
  });
});

describe('parseCapture - duplicates', () => {
  const NOTE = 'Met Anna Vu at Rohto Vietnam today. They are worried about lead time. I will send the plan Friday.';

  test('21. and 42. a person already on the account is marked, not proposed again', () => {
    const result = parse(NOTE, {
      stakeholders: [{ id: 'sh-1', accountName: ACCOUNT, name: 'Anna Vu' }],
    });
    const [person] = of(result, 'stakeholder');
    assert.equal(person.status, 'already_recorded');
    assert.equal(person.duplicateOf, 'sh-1');
  });

  test('an open objection saying the same thing is marked as already recorded', () => {
    const first = of(parse(NOTE), 'objection')[0];
    const result = parse(NOTE, {
      objections: [{
        id: 'obj-1', accountName: ACCOUNT, opportunityId: 'opp-1',
        objectionText: first.text, status: 'Open',
      }],
    });
    assert.equal(of(result, 'objection')[0].status, 'already_recorded');
  });

  test('42. a RESOLVED objection does not suppress the same concern coming back', () => {
    const first = of(parse(NOTE), 'objection')[0];
    const result = parse(NOTE, {
      objections: [{
        id: 'obj-1', accountName: ACCOUNT, opportunityId: 'opp-1',
        objectionText: first.text, status: 'Resolved',
      }],
    });
    assert.equal(of(result, 'objection')[0].status, 'proposed',
      'a concern raised again after being settled is news, not a duplicate');
  });

  test('an open promise saying the same thing is marked rather than duplicated', () => {
    const first = of(parse(NOTE), 'commitment')[0];
    const result = parse(NOTE, {
      openCommitments: [{ id: 'c-1', accountName: ACCOUNT, opportunityId: 'opp-1', commitmentText: first.text }],
    });
    assert.equal(of(result, 'commitment')[0].status, 'already_recorded');
  });

  test('the same value already on the deal is not proposed as a change', () => {
    const result = parse('Rohto Vietnam PO value is 300,000,000 VND.', {
      opportunities: [{
        id: 'opp-1', accountName: ACCOUNT, opportunityName: 'QC analyser rollout',
        currency: 'VND', estimatedValue: 300_000_000,
      }],
      accounts: [{ id: 'acct-1', accountName: ACCOUNT }],
    });
    const [value] = of(result, 'opportunity_value');
    if (value) assert.equal(value.status, 'already_recorded');
  });
});

describe('parseCapture - dates keep their local meaning', () => {
  test('relative dates resolve against the injected capture date, never the clock', () => {
    const early = parseCapture({
      rawCapture: 'I will send the quote Friday.',
      captureDate: '2026-09-05',
      context: context(),
    });
    const later = parseCapture({
      rawCapture: 'I will send the quote Friday.',
      captureDate: '2026-09-08',
      context: context(),
    });
    assert.equal(of(early, 'commitment')[0].dueDate, '2026-09-11');
    assert.equal(of(later, 'commitment')[0].dueDate, '2026-09-11');
  });

  test('a due date is a business day, never a timestamp', () => {
    const commitment = of(parse('I will send the pack by 20 September.'), 'commitment')[0];
    assert.match(commitment.dueDate, /^\d{4}-\d{2}-\d{2}$/, 'no time, no zone, no drift');
  });
});

describe('commitCapturedFacts - partial failure is honest and retry is safe', () => {
  const target = { accountName: ACCOUNT, opportunityId: 'opp-1', opportunityName: 'QC analyser rollout' };

  const commitFact = (id) => ({
    id, kind: 'commitment', party: 'self', ownerLabel: 'You',
    text: `Send the pack ${id}`, dueDate: '2026-09-11',
    evidence: 'I will send the pack.', certainty: 'exact', target, status: 'accepted',
  });
  /** No deal on the context, so this one cannot be written. */
  const orphanValue = (id) => ({
    id, kind: 'opportunity_value', amount: 400_000_000, currency: 'VND', approximate: false,
    evidence: 'PO value is 400,000,000 VND.', certainty: 'exact',
    target: { ...target, opportunityId: 'missing-deal' }, status: 'accepted',
  });

  const commitContext = {
    scope: { userId: null },
    userId: null,
    opportunities: [],
    sourceActivityId: 'act-1',
    captureDate: CAPTURE_DATE,
    isSample: false,
  };

  const changeSet = (facts) => ({
    rawCapture: 'note', captureDate: CAPTURE_DATE, target, facts, unsupported: [],
  });

  test('34. and 35. the ones that land are reported, the one that fails stays retryable', async () => {
    const result = await commitCapturedFacts(
      changeSet([commitFact('c-1'), orphanValue('v-1'), commitFact('c-2')]),
      commitContext,
    );

    assert.equal(result.outcomes.filter((outcome) => outcome.ok).length, 2, 'the two writable facts land');
    assert.equal(result.retryable.length, 1, 'the one that failed is kept');
    assert.equal(result.retryable[0].id, 'v-1');
    const failure = result.outcomes.find((outcome) => !outcome.ok);
    assert.match(failure.error, /deal/i, 'and says why, in words the operator can act on');
  });

  test('34. a retry never writes a fact that already succeeded', async () => {
    const facts = [commitFact('c-1'), orphanValue('v-1')];
    const first = await commitCapturedFacts(changeSet(facts), commitContext);
    const succeeded = first.outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.factId);

    const retry = await commitCapturedFacts(changeSet(facts), commitContext, succeeded);
    assert.deepEqual(
      retry.outcomes.map((outcome) => outcome.factId),
      ['v-1'],
      'only the failed one is attempted again',
    );
  });

  test('22. a change set with nothing accepted writes nothing at all', async () => {
    const result = await commitCapturedFacts(
      changeSet([{ ...commitFact('c-1'), status: 'ignored' }, { ...commitFact('c-2'), status: 'proposed' }]),
      commitContext,
    );
    assert.deepEqual(result.outcomes, []);
    assert.deepEqual(result.retryable, []);
  });
});
