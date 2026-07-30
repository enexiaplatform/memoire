import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActivityLedger, isAttached } from '../src/utils/activityLedger.ts';
import { activitySubjectKey, buildActivityAnalytics } from '../src/utils/activityAnalytics.ts';
import { buildActivityPivot, keyOf } from '../src/utils/activityPivot.ts';
import { buildAccountAliasIndex } from '../src/utils/accountAliases.ts';

/**
 * The activity-ledger contract.
 *
 * Activity is a lens: it stores nothing and every figure on it is a count over
 * records other surfaces own. That makes exactly one class of bug possible and
 * fatal - the lens quietly disagreeing with the thing it is looking at. The
 * properties pinned here are the ones whose loss would turn the page from an
 * instrument into a second opinion:
 *
 *   - every row resolves to exactly one typed subject, and an unknown name is
 *     reported as unknown rather than filed as admin;
 *   - the two rates that could flatter (attachment, follow-through) cannot,
 *     because neither counts work it has no right to judge;
 *   - a pivot conserves its rows: nothing is lost to folding or to a cell that
 *     does not exist;
 *   - the whole thing is pure, so two reads of one workspace agree.
 */

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Cobetter', opportunityName: 'Isolator line',
  stage: 'Proposal', estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: 'Q3',
  brand: '', productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor',
  status: 'Active', createdAt: '2026-07-01', updatedAt: '2026-07-01', storageMode: 'local', ...patch,
});

const touch = (patch = {}) => ({
  id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'Cobetter', opportunityName: '',
  activityType: 'Customer meeting', summary: 'Met the QA lead', nextAction: '', dueDate: '', tags: [],
  rawNote: 'Met the QA lead', activityDate: '2026-07-20', linkedOpportunityId: '', linkedOpportunityName: '',
  linkedAccountName: '', linkStatus: 'Unlinked', createdAt: '2026-07-20', updatedAt: '2026-07-20',
  storageMode: 'local', ...patch,
});

const planRecord = (patch = {}) => ({
  id: `p-${Math.random().toString(36).slice(2)}`, date: '2026-07-20', label: 'Send the pricing',
  tag: 'Cobetter', done: false, createdAt: '2026-07-01', updatedAt: '2026-07-01', ...patch,
});

const account = (accountName) => ({
  id: `acc-${accountName}`, accountName, segment: '', industry: '', location: '',
  accountPotential: 'Medium', relationshipStatus: 'Active', keyStakeholders: [], notes: '', tags: [],
  createdAt: '2026-07-01', updatedAt: '2026-07-01', storageMode: 'local',
});

const JULY = { start: '2026-07-01', end: '2026-07-31' };
const TODAY = '2026-07-25';

const ledger = (patch = {}) => buildActivityLedger({
  activities: [], planRecords: [], opportunities: [], accounts: [], obligations: [],
  range: JULY, today: TODAY, ...patch,
});

// 1. A captured touch is history and is never open. Salesforce files completed
//    activity below the line for a reason: something that already happened
//    cannot be owed, and showing it as open would put finished work on the list
//    of things still to do.
{
  const entries = ledger({ activities: [touch()] });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'event');
  assert.equal(entries[0].state, 'done');
  assert.equal(entries[0].bucket, 'history');
}

// 2. Dated work carries a real state, and the bucket follows the state rather
//    than the record type. An overdue item and an item due Friday must not read
//    the same.
{
  const entries = ledger({
    planRecords: [
      planRecord({ id: 'p-late', date: '2026-07-10', label: 'Late thing' }),
      planRecord({ id: 'p-soon', date: '2026-07-30', label: 'Future thing' }),
      planRecord({ id: 'p-done', date: '2026-07-12', label: 'Finished thing', done: true }),
    ],
  });
  const byLabel = new Map(entries.map((entry) => [entry.subject, entry]));
  assert.equal(byLabel.get('Late thing').state, 'overdue');
  assert.equal(byLabel.get('Late thing').bucket, 'open');
  assert.equal(byLabel.get('Future thing').state, 'open');
  assert.equal(byLabel.get('Future thing').bucket, 'open');
  assert.equal(byLabel.get('Finished thing').state, 'done');
  assert.equal(byLabel.get('Finished thing').bucket, 'history');
  entries.forEach((entry) => assert.equal(entry.kind, 'task'));
}

// 3. The subject pointer (Salesforce's WhatId). Exactly one subject per row, and
//    the strongest available link wins: a deal beats its account, an account
//    beats a bare name.
{
  const deal = opp({ id: 'o-1' });
  const linked = ledger({
    activities: [touch({ linkedOpportunityId: 'o-1', linkedOpportunityName: 'Isolator line' })],
    opportunities: [deal],
  });
  assert.equal(linked[0].relatedTo.type, 'opportunity');
  assert.equal(linked[0].relatedTo.name, 'Isolator line');
  assert.ok(linked[0].relatedTo.href.includes('o-1'), 'an opportunity subject links to that opportunity');

  const known = ledger({ activities: [touch()], accounts: [account('Cobetter')] });
  assert.equal(known[0].relatedTo.type, 'account');
  assert.ok(known[0].relatedTo.href.includes('Cobetter'));

  const brandWork = ledger({
    planRecords: [planRecord({ tag: 'Sartorius', label: 'Research the range' })],
    opportunities: [opp({ accountName: 'Someone else', brand: 'Sartorius' })],
  });
  assert.equal(brandWork[0].relatedTo.type, 'brand');
  assert.equal(brandWork[0].relatedTo.name, 'Sartorius');
}

// 4. The row this page exists for: a name the operator is working that the
//    workspace has never heard of is reported as unresolved, not swept into
//    Internal. Filing it as admin is what made half a hand-typed week read as
//    unattributable, and it is the difference between a leak you can see and a
//    leak you cannot.
{
  const entries = ledger({ planRecords: [planRecord({ tag: 'Tenamyd', label: 'Pricing tactic' })] });
  assert.equal(entries[0].relatedTo.type, 'unresolved');
  assert.equal(entries[0].relatedTo.name, 'Tenamyd');
  assert.equal(entries[0].relatedTo.href, '', 'there is nowhere to link to yet, and pretending otherwise 404s');
  assert.equal(isAttached(entries[0]), false);

  // A category tag is not a customer. Proposing "New Customer" as a subject
  // would put a permanent phantom at the top of every leaderboard.
  for (const tag of ['Internal', 'New Customer', 'Admin']) {
    const [entry] = ledger({ planRecords: [planRecord({ tag, label: 'Weekly report' })] });
    assert.equal(entry.relatedTo.type, 'internal', `${tag} must classify as internal, not as a customer`);
  }
}

// 5. A customer the operator has merged is one subject. Two spellings of one
//    account splitting into two rows would invent a gap in both, and would show
//    a merge the user already performed as still undone.
{
  const aliases = buildAccountAliasIndex([{
    id: 'm1', kind: 'merge', canonicalAccountName: 'DP Lab', mergedNames: ['DPLab'],
    createdAt: '2026-07-01', updatedAt: '2026-07-01',
  }]);
  const entries = ledger({
    activities: [touch({ accountName: 'DP Lab' }), touch({ accountName: 'DPLab' })],
    accounts: [account('DP Lab')],
    accountAliases: aliases,
  });
  assert.equal(new Set(entries.map(activitySubjectKey)).size, 1, 'a merged customer is one subject');
  entries.forEach((entry) => assert.equal(entry.relatedTo.name, 'DP Lab'));

  // And without the merge they stay two, because the app must not decide that
  // two spellings are one customer on the operator's behalf.
  const unmerged = ledger({
    activities: [touch({ accountName: 'DP Lab' }), touch({ accountName: 'DPLab' })],
    accounts: [account('DP Lab')],
  });
  assert.equal(new Set(unmerged.map(activitySubjectKey)).size, 2, 'near-miss spellings are not folded silently');
  assert.equal(
    unmerged.filter((entry) => entry.relatedTo.type === 'unresolved').length,
    1,
    'the unmerged spelling shows up as a name the workspace does not know - which is true',
  );
}

// 5b. An obligation's counterparty is never a missing customer. What you owe goes
//     to vendors, principals and expense categories - resolving "Tools & software"
//     as an account waiting to be created is both false and the fastest way to
//     teach an operator to ignore the amber chip, because it would fire on every
//     recurring cost.
{
  const owe = (counterparty, label) => ({
    id: `ob-${counterparty}`, kind: 'Payment', label, counterparty,
    amount: 5_000_000, currency: 'VND', amountBase: 5_000_000, dueDate: '2026-07-24',
    daysUntilDue: -1, status: 'Overdue', href: '/app/revenue',
  });

  const entries = ledger({
    obligations: [owe('Tools & software', 'Subscription invoice'), owe('Sartorius', 'Purchase order')],
    opportunities: [opp({ accountName: 'Someone else', brand: 'Sartorius' })],
    planRecords: [planRecord({ tag: 'Tenamyd', label: 'Pricing tactic' })],
  });

  const expenseLine = entries.find((entry) => entry.type === 'Obligation' && entry.subject === 'Subscription invoice');
  assert.equal(expenseLine.relatedTo.type, 'internal', 'an expense category is not an unresolved customer');
  assert.equal(expenseLine.domain, 'Money', 'it belongs to the money domain');
  assert.ok(expenseLine.relatedTo.href, 'and it still opens where the obligation lives');

  const principalLine = entries.find((entry) => entry.subject === 'Purchase order');
  assert.equal(principalLine.relatedTo.type, 'brand', 'a principal you owe is still the principal');
  assert.equal(principalLine.relatedTo.name, 'Sartorius');

  const { unresolvedSubjects } = buildActivityAnalytics({ entries, range: JULY, today: TODAY });
  assert.deepEqual(
    unresolvedSubjects.map((subject) => subject.name),
    ['Tenamyd'],
    'only a real customer with no record is offered as an account to create',
  );
}

// 5c. Customer-facing dated work is not admin. `readDomain` falls back to
//     Internal when no keyword matches, which is right for classifying internal
//     work and wrong for a deal's next action - a week of "tender review
//     follow-up" lines would otherwise report as a week spent on admin.
{
  const [customerWork] = ledger({
    planRecords: [planRecord({ tag: 'Cobetter', label: 'Tender review follow-up' })],
    opportunities: [opp({ accountName: 'Cobetter' })],
    accounts: [account('Cobetter')],
  });
  assert.equal(customerWork.domain, 'Sales', 'work with a customer behind it defaults to Sales, not Internal');

  const [keyworded] = ledger({
    planRecords: [planRecord({ tag: 'Cobetter', label: 'Chase the invoice' })],
    accounts: [account('Cobetter')],
  });
  assert.equal(keyworded.domain, 'Money', 'an explicit keyword still wins over the default');

  const [admin] = ledger({ planRecords: [planRecord({ tag: 'Internal', label: 'Submit the KPI report' })] });
  assert.equal(admin.domain, 'Internal', 'genuinely internal work stays internal');
}

// 6. Attachment excludes internal work from its denominator. Counting a KPI
//    report as unattached would make a well-run week look careless - and would
//    let the operator improve the number by writing fewer internal items down.
{
  const entries = ledger({
    activities: [touch({ accountName: 'Cobetter' })],
    accounts: [account('Cobetter')],
    planRecords: [
      planRecord({ tag: 'Tenamyd', label: 'Pricing tactic' }),
      planRecord({ tag: 'Internal', label: 'Weekly report' }),
      planRecord({ tag: 'Internal', label: 'Submit the KPI report' }),
    ],
  });
  const analytics = buildActivityAnalytics({ entries, range: JULY, today: TODAY });
  assert.equal(analytics.attachment.attached, 1);
  assert.equal(analytics.attachment.unresolved, 1);
  assert.equal(analytics.attachment.internal, 2);
  assert.equal(analytics.attachment.rate, 0.5, 'internal work is out of the denominator entirely');

  const internalOnly = buildActivityAnalytics({
    entries: entries.filter((entry) => entry.relatedTo.type === 'internal'),
    range: JULY,
    today: TODAY,
  });
  assert.equal(internalOnly.attachment.rate, null, 'a week of internal work scores no rate, not 0%');
}

// 7. Follow-through only judges work whose day has come. A task dated Friday is
//    neither kept nor missed on Wednesday, so a productive week of planning
//    ahead must never report as a week of failure.
{
  const entries = ledger({
    planRecords: [
      planRecord({ id: 'p-done', date: '2026-07-14', done: true, label: 'Done on time' }),
      planRecord({ id: 'p-late', date: '2026-07-15', label: 'Missed' }),
      planRecord({ id: 'p-ahead', date: '2026-07-31', label: 'Not due yet' }),
    ],
  });
  const { followThrough } = buildActivityAnalytics({ entries, range: JULY, today: TODAY });
  assert.equal(followThrough.done, 1);
  assert.equal(followThrough.overdue, 1);
  assert.equal(followThrough.ahead, 1);
  assert.equal(followThrough.settled, 2);
  assert.equal(followThrough.rate, 0.5);

  const aheadOnly = buildActivityAnalytics({
    entries: entries.filter((entry) => entry.state === 'open'),
    range: JULY,
    today: TODAY,
  });
  assert.equal(aheadOnly.followThrough.rate, null, 'nothing due yet is not 0%');
}

// 8. The heatmap draws its empty days. Dropping them turns a picture of rhythm
//    into a bar chart of totals, which is the one thing a calendar already does.
{
  const entries = ledger({ activities: [touch({ activityDate: '2026-07-20' })] });
  const { heatmap } = buildActivityAnalytics({ entries, range: JULY, today: TODAY });
  assert.equal(heatmap.length, 31, 'every day in the range gets a cell');
  assert.equal(heatmap.filter((day) => day.count > 0).length, 1);
  assert.equal(heatmap.find((day) => day.date === '2026-07-20').count, 1);
}

// 9. A pivot conserves its rows. Folding the long tail into "N more" must move
//    counts, never lose them, and no row may exist that the ledger cannot
//    reproduce by filtering on the same keys.
{
  const planRecords = [];
  for (let index = 0; index < 25; index += 1) {
    planRecords.push(planRecord({ id: `p${index}`, tag: `Customer ${index}`, date: '2026-07-20' }));
  }
  const entries = ledger({ planRecords });
  const pivot = buildActivityPivot(entries, 'relatedTo', 'state', { maxRows: 5 });

  assert.equal(pivot.grandTotal, entries.length, 'the grand total is every row');
  assert.equal(
    pivot.rows.reduce((sum, row) => sum + row.total, 0),
    entries.length,
    'row totals add up to the grand total',
  );
  assert.equal(
    pivot.columnTotals.reduce((sum, total) => sum + total, 0),
    entries.length,
    'column totals add up to the grand total',
  );
  assert.ok(pivot.truncatedRows > 0, 'the tail was folded');
  assert.equal(pivot.rows[pivot.rows.length - 1].label, `${pivot.truncatedRows} more`);

  // Every cell in the grid is reachable by filtering the ledger on the same two
  // keys - the property that makes the pivot an instrument rather than a report.
  const firstRow = pivot.rows[0];
  const firstColumn = pivot.columns[0];
  const behindTheCell = entries.filter((entry) => (
    keyOf(entry, 'relatedTo') === firstRow.key && keyOf(entry, 'state') === firstColumn.key
  ));
  assert.equal(behindTheCell.length, firstRow.cells[0].count);
}

// 10. Chronological dimensions read in time order, not by size. A trend sorted
//     by volume is not a trend.
{
  const entries = ledger({
    activities: [
      touch({ activityDate: '2026-07-02' }),
      touch({ activityDate: '2026-07-20' }),
      touch({ activityDate: '2026-07-21' }),
    ],
  });
  const pivot = buildActivityPivot(entries, 'week', 'state');
  const weeks = pivot.rows.map((row) => row.key);
  assert.deepEqual([...weeks].sort(), weeks, 'weeks read earliest first whatever their size');
}

// 11. The lens is pure. Two reads of one workspace agree, and nothing is written
//     anywhere - which is what lets this page be added without a migration and
//     removed without a trace.
{
  const input = {
    activities: [touch(), touch({ activityDate: '2026-07-21' })],
    planRecords: [planRecord(), planRecord({ id: 'p2', date: '2026-07-22' })],
    opportunities: [opp({ nextAction: 'Send the quote', nextActionDate: '2026-07-23' })],
    accounts: [account('Cobetter')],
  };
  assert.deepEqual(ledger(input), ledger(input), 'the same workspace derives the same ledger');

  const source = readFileSync('src/utils/activityLedger.ts', 'utf8');
  const analytics = readFileSync('src/utils/activityAnalytics.ts', 'utf8');
  for (const [name, text] of [['activityLedger', source], ['activityAnalytics', analytics]]) {
    assert.equal(/localStorage|supabase|fetch\(/.test(text), false, `${name} must derive, never store or fetch`);
  }
}

// 12. Dated work comes from the plan board, not from a second derivation of the
//     week. Two answers to "what is on my week" is how one product starts
//     telling an operator two different numbers.
{
  const source = readFileSync('src/utils/activityLedger.ts', 'utf8');
  assert.ok(
    source.includes('buildPlanBoard'),
    'the task side of the ledger must read the plan board rather than re-deriving dated work',
  );
}

// 13. A range spanning several months collects all of them. The month-at-a-time
//     board walk is an implementation detail; losing February to it would not be.
{
  const entries = buildActivityLedger({
    activities: [],
    planRecords: [
      planRecord({ id: 'p-may', date: '2026-05-05' }),
      planRecord({ id: 'p-jun', date: '2026-06-15' }),
      planRecord({ id: 'p-jul', date: '2026-07-25' }),
    ],
    opportunities: [], accounts: [], obligations: [],
    range: { start: '2026-05-01', end: '2026-07-31' },
    today: TODAY,
  });
  assert.deepEqual(
    entries.map((entry) => entry.date).sort(),
    ['2026-05-05', '2026-06-15', '2026-07-25'],
    'every month in the range is walked',
  );
}

// 14. Activity is a lens in the registry, and the surface it renders is the one
//     the registry declares. A page wired straight into the router without a
//     registry entry is how the rail used to grow a destination nobody chose.
{
  const registry = readFileSync('src/config/featureRegistry.ts', 'utf8');
  const entry = registry.match(/\{\s*id: 'activity',[\s\S]*?\n {2}\},/);
  assert.ok(entry, 'featureRegistry must declare the activity surface');
  assert.ok(entry[0].includes("status: 'global'"), 'Activity is a global lens, not a primary destination');
  assert.ok(entry[0].includes("route: '/app/activity'"), 'Activity must declare its route');
  assert.ok(entry[0].includes('navVisible: true'), 'Activity must be reachable from the rail');
}

// 15. Both halves of the Timeline calendar draw the subject from the same
//     resolver the ledger counts with. Two resolvers would let a note read
//     "Account: Cobetter" on the calendar and "not linked yet" on Activity, on
//     the same data, in the same session - and the operator would be right to
//     stop trusting both.
{
  const plan = readFileSync('src/features/plan/WeeklyPlanPage.tsx', 'utf8');
  const history = readFileSync('src/features/calendar/SalesActivityCalendarPage.tsx', 'utf8');
  const chip = readFileSync('src/components/common/SubjectChip.tsx', 'utf8');

  assert.ok(
    plan.includes('resolvePlanItemSubject') && plan.includes('buildActivityLedgerContext'),
    'Timeline > Upcoming must resolve each note with the ledger resolver',
  );
  assert.ok(
    history.includes('resolveActivitySubject') && history.includes('buildActivityLedgerContext'),
    'Timeline > History must resolve each touch with the ledger resolver',
  );
  for (const [name, source] of [['Upcoming', plan], ['History', history]]) {
    assert.ok(source.includes('<SubjectChip'), `Timeline > ${name} must draw the shared subject chip`);
  }
  // The unresolved tone has to stay visually distinct. If it ever renders like
  // the others, the one fact this chip exists to carry becomes invisible.
  assert.ok(
    /unresolved:[^\n]*border-dashed/.test(chip),
    'the unresolved subject must stay visually distinct from a resolved one',
  );
}

console.log('Activity ledger contract verified: one typed subject per row, honest rates, conserving pivots, pure derivation.');
