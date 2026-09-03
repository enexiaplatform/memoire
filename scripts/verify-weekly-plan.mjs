import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildPlanBoard,
  createDerivedCompletionRecord,
  createDismissedSuggestionRecord,
  createPersonalPlanRecord,
  getPlanRange,
} from '../src/utils/weeklyPlan.ts';
import { buildPlanSuggestions } from '../src/utils/planSuggestions.ts';

// The plan board is the week laid out as days. Two kinds of item share a
// column: commitments already dated in the workspace, and the operator's own
// work. These pin the boundary between them - the board may never become a
// second source of truth for a deal.

const opportunity = (id, accountName, nextAction, nextActionDate, status = 'Active') => ({
  id, accountName, nextAction, nextActionDate, status,
  opportunityName: `${accountName} deal`, stage: 'Qualified', estimatedValue: 1000, currency: 'VND',
});
const obligation = (id, label, counterparty, dueDate) => ({
  id, label, counterparty, dueDate, kind: 'payment', amount: 1000, currency: 'VND',
  amountBase: 1000, daysUntilDue: 1, status: 'upcoming', href: '/app/revenue',
});
const anchor = new Date(2026, 6, 22); // Wed of the Mon 2026-07-20 week

// 1. The plan week is the review week. If these ever diverged, "this week's
//    commitments" and "this week's plan" would silently mean different days.
{
  const planRange = getPlanRange('week', anchor);
  assert.equal(planRange.start, '2026-07-20', 'plan weeks start Monday');
  assert.equal(planRange.end, '2026-07-26', 'plan weeks end Sunday');

  const habit = readFileSync(new URL('../src/utils/pipelineReviewHabit.ts', import.meta.url), 'utf8');
  assert.match(habit, /const mondayOffset = day === 0 \? -6 : 1 - day;/, 'the review week id also starts Monday');
}

// 2. Derived items come from the workspace, and only from live commitments.
{
  const board = buildPlanBoard({
    periodType: 'week',
    anchorDate: anchor,
    opportunities: [
      opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20'),
      opportunity('o2', 'ACS', 'Outside the week', '2026-08-11'),
      opportunity('o3', 'KN', 'Already closed', '2026-07-21', 'Won'),
      opportunity('o4', 'DCL', 'No date at all', ''),
    ],
    obligations: [obligation('e1', 'VAT payment', 'Tax office', '2026-07-23')],
    records: [],
    today: '2026-07-22',
  });

  assert.equal(board.derivedCount, 2, 'only the in-period, active, dated commitments derive');
  const monday = board.days.find((day) => day.date === '2026-07-20');
  assert.equal(monday.items[0].tag, 'MDL', 'the account becomes the tag');
  assert.equal(monday.items[0].label, 'Connect Mr. Tinh');
  assert.equal(board.days.find((day) => day.date === '2026-07-23').items[0].kind, 'obligation');
}

// 3. Completion is stored against the derived identity, never written back onto
//    the deal. Rescheduling the deal is a new commitment and starts open again.
{
  const opp = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
  const seed = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
  });
  const item = seed.days.find((day) => day.date === '2026-07-20').items[0];
  const completion = createDerivedCompletionRecord(item, true);

  assert.ok(completion.derivedKey.includes('2026-07-20'), 'the completion key carries the date it was promised for');
  assert.equal(completion.done, true);
  assert.ok(completion.doneAt, 'a tick records when it happened');

  const ticked = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [completion], today: '2026-07-22',
  });
  assert.equal(ticked.days.find((day) => day.date === '2026-07-20').items[0].done, true);

  const moved = buildPlanBoard({
    periodType: 'week',
    anchorDate: anchor,
    opportunities: [opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-22')],
    obligations: [],
    records: [completion],
    today: '2026-07-22',
  });
  assert.equal(moved.doneCount, 0, 'a rescheduled commitment is not pre-ticked by the old plan');
}

// 3b. A tick made in the demo sandbox is tagged as sample data. Without this,
//     signing in on the same browser would pull demo ticks into a live plan.
{
  const opp = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
  const seed = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
  });
  const item = seed.days.find((day) => day.date === '2026-07-20').items[0];

  const demoTick = createDerivedCompletionRecord(item, true, { source: 'demo', isSample: true });
  assert.equal(demoTick.source, 'demo');
  assert.equal(demoTick.isSample, true);

  const liveTick = createDerivedCompletionRecord(item, true, { source: 'user', isSample: false });
  assert.equal(liveTick.isSample, false, 'a live tick is not marked as sample data');

  const page = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /source: sampleDataActive \? 'demo' : 'user'/, 'the page tags records by workspace mode');
}

// 4. Personal work is first-class but distinguishable, and the bracket the
//    operator already writes is read as the tag.
{
  const board = buildPlanBoard({
    periodType: 'week',
    anchorDate: anchor,
    opportunities: [],
    obligations: [],
    records: [
      createPersonalPlanRecord({ date: '2026-07-20', label: '[Internal] Submit KPI' }),
      createPersonalPlanRecord({ date: '2026-07-21', label: 'Business trip claim' }),
    ],
    today: '2026-07-22',
  });

  assert.equal(board.personalCount, 2);
  const kpi = board.days.find((day) => day.date === '2026-07-20').items[0];
  assert.equal(kpi.kind, 'personal');
  assert.equal(kpi.tag, 'Internal');
  assert.equal(kpi.label, 'Submit KPI');
  assert.equal(kpi.href, '', 'a personal item has nowhere commercial to link to');
}

// 5. Ticking an item never writes back onto the deal - the whole reason the
//    board can be checked off without lying to the rest of the app.
//
//    Rescheduling and rewording DO write back, and must: dragging an item to
//    Thursday or correcting its wording is the operator stating an intention
//    about the commitment itself, not a note about their own day. If those
//    edits stayed on the board, the board would become the second source of
//    truth this whole contract exists to prevent - the deal would still say
//    Tuesday while the seller looked at Thursday. So the rule is narrow: the
//    completion path is read-only, the explicit-edit paths are not, and no
//    path may touch anything other than the deal's next action and its date.
{
  const page = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');

  const toggle = page.slice(page.indexOf('const toggleItem'), page.indexOf('const carryCompletionStub'));
  assert.ok(toggle.length > 0, 'the completion handler must be findable');
  assert.doesNotMatch(
    toggle,
    /updateOpportunity|saveOpportunity|deleteOpportunity|updateSalesActivity/,
    'checking an item off must not mutate the deal or the touch it came from',
  );
  // The rule "a derived tick is stored as its own completion stub" is written
  // once, in weeklyPlan's shared toggle, and every surface with one of these
  // checkboxes on it calls that. It used to be re-implemented per surface, and
  // Today's strip and this board each carried their own copy of the personal-vs-
  // derived branch - two copies of the one rule that keeps the board from
  // becoming a second source of truth for a deal.
  assert.match(toggle, /createPlanItemToggleRecord/, 'the board ticks through the shared plan toggle');
  const strip = readFileSync(new URL('../src/features/dashboard/TodayCommitmentStrip.tsx', import.meta.url), 'utf8');
  assert.match(strip, /createPlanItemToggleRecord/, "Today's plan strip ticks through the same shared toggle");
  assert.doesNotMatch(
    strip.slice(strip.indexOf('const toggleItem'), strip.indexOf('const openItem')),
    /updateOpportunity|saveOpportunity|deleteOpportunity|updateSalesActivity/,
    'ticking on Today must not mutate the deal or the touch it came from either',
  );

  const model = readFileSync(new URL('../src/utils/weeklyPlan.ts', import.meta.url), 'utf8');
  const sharedToggle = model.slice(
    model.indexOf('export function createPlanItemToggleRecord'),
    model.indexOf('export function planLinkKindLabel'),
  );
  assert.ok(sharedToggle.length > 0, 'the shared plan toggle must be findable');
  assert.match(sharedToggle, /createDerivedCompletionRecord/, 'a derived tick is stored as its own completion stub');

  // Every write the board is allowed to make, and the only fields it may set.
  //
  // Every field in each write, not just the one nearest the spread: the old
  // pattern stopped at the first key, so a second field added to the same
  // object - the customer, the decision maker, the value - would have moved a
  // whole opportunity from a calendar cell with this contract still green.
  const dealWrites = [...page.matchAll(/opportunityToFormInput\(opportunity\),([\s\S]*?)\}/g)]
    .flatMap((match) => [...match[1].matchAll(/([a-zA-Z]+):/g)].map((field) => field[1]));
  assert.deepEqual(
    [...new Set(dealWrites)].sort(),
    ['nextAction', 'nextActionDate'],
    'the board may only reschedule or reword the deal\'s next action',
  );
  assert.doesNotMatch(page, /saveOpportunity|deleteOpportunity/, 'the board never creates or deletes a deal');

  // The wording may change; the promise may not. Ticking a box records that the
  // work was done - and, since 2026-09-03, offers to write down what happened -
  // but it never moves the deal itself, and the board has to say so.
  assert.match(page, /moves no deal|does not change the deal/, 'the page says so to the operator');
  assert.match(page, /isSample: sampleDataActive/, 'demo plan items are tagged at birth');
}

// 6. Storage contract: another JSON collection, no new API function.
{
  const cloudStore = readFileSync(new URL('../src/services/cloudJsonCollectionStore.ts', import.meta.url), 'utf8');
  assert.match(cloudStore, /'plan_items'/, 'plan_items is a registered JSON collection');

  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby function cap (found ${apiFunctions.length})`);
}

// 7. The plan board is reachable as Timeline > Upcoming, and the old /app/plan
// URL still resolves. Plan is no longer its own destination: a plan item is a
// future-dated action, and a separate nav entry made Plan and Activity read as
// rival calendars.
{
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="timeline"/, 'the timeline route is registered');
  assert.match(app, /path="plan" element=\{<LegacyRedirect/, 'the old plan URL still resolves');

  const timeline = readFileSync(new URL('../src/features/timeline/TimelinePage.tsx', import.meta.url), 'utf8');
  assert.match(timeline, /<WeeklyPlanPage embedded[ \n]/, 'Timeline > Upcoming renders the plan board');
  assert.match(timeline, /Upcoming/, 'Timeline offers the Upcoming view');
  assert.match(timeline, /History/, 'Timeline offers the History view');
}

// 8. Suggestions read last week's ledger, explain themselves, and are never
//    work until accepted. A refusal is remembered so it is not asked twice.
{
  const week = { rangeStart: '2026-07-20', rangeEnd: '2026-07-26' };
  const touch = (overrides = {}) => ({
    id: 'a1', accountName: 'MDL', linkedAccountName: '', linkedOpportunityId: '',
    activityType: 'Customer meeting', activityDate: '2026-07-15', nextAction: '', dueDate: '',
    summary: '', risks: [], ...overrides,
  });

  // A dated next action is not a suggestion any more - it derives straight onto
  // the board, so the seller records it once and never re-adds it by hand.
  const datedOntoBoard = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [], obligations: [],
    activities: [touch({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
    records: [], today: '2026-07-22',
  });
  assert.equal(datedOntoBoard.captureCount, 1, 'a dated captured next action lands on the plan by itself');
  assert.equal(datedOntoBoard.days.find((day) => day.date === '2026-07-22').items[0].kind, 'capture');
  const notSuggested = buildPlanSuggestions({
    activities: [touch({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
    opportunities: [], records: [], ...week,
  });
  assert.equal(notSuggested.length, 0, 'and so it is never also proposed as a thing to add');

  // The panel still owns the softer half: a next action nobody put a date on.
  const promised = buildPlanSuggestions({
    activities: [touch({ nextAction: 'Call the buyer back' })],
    opportunities: [], records: [], ...week,
  });
  assert.equal(promised.length, 1);
  assert.equal(promised[0].kind, 'undated-next-action');
  assert.ok(promised[0].reason, 'every suggestion states the rule that fired');
  assert.ok(promised[0].evidence, 'every suggestion cites the capture it came from');
  assert.ok(promised[0].sourceActivityId, 'every suggestion points back at its activity');

  // Already on the board via the deal: proposing it again would show one
  // commitment twice.
  const duplicate = buildPlanSuggestions({
    activities: [touch({ linkedOpportunityId: 'o1', nextAction: 'Send quote', dueDate: '2026-07-22' })],
    opportunities: [{
      id: 'o1', accountName: 'MDL', opportunityName: 'MDL deal', status: 'Active',
      nextAction: 'Send quote', nextActionDate: '2026-07-22', stage: 'Qualified',
      estimatedValue: 1000, currency: 'VND',
    }],
    records: [], ...week,
  });
  assert.equal(duplicate.length, 0, 'a commitment already on the board is not suggested again');

  // Refusal is stored, not forgotten.
  const dismissal = createDismissedSuggestionRecord({
    suggestionKey: promised[0].key,
    date: promised[0].suggestedDate,
    label: promised[0].label,
    tag: promised[0].tag,
  });
  assert.equal(dismissal.dismissed, true);
  const afterDismissal = buildPlanSuggestions({
    activities: [touch({ nextAction: 'Call the buyer back' })],
    opportunities: [], records: [dismissal], ...week,
  });
  assert.equal(afterDismissal.length, 0, 'a refused suggestion is never asked twice');

  // A dismissal is evidence, never work: it must not appear on the board.
  const board = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [], obligations: [],
    records: [dismissal], today: '2026-07-22',
  });
  assert.equal(board.totalCount, 0, 'a refused suggestion never becomes a plan item');

  // Capped, so the panel stays a plan rather than a description of the data -
  // the same lesson the review page learned from "Recommended: 865".
  const many = buildPlanSuggestions({
    activities: Array.from({ length: 20 }, (_, index) => touch({ id: `a${index}`, accountName: `Account ${index}` })),
    opportunities: [], records: [], ...week,
  });
  assert.ok(many.length <= 6, `suggestions must stay capped (got ${many.length})`);

  const panel = readFileSync(new URL('../src/features/plan/PlanSuggestionsPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /Nothing here is on your plan until you put it there/, 'the panel says suggestions are not commitments');
}

// 8b. Capture is the single place a dated next action is recorded; the plan
//     reflects it both ways, and neither direction ever writes a second copy.
{
  const { findClosablePlanItems, getCaptureScheduledEntries, planItemDoneRecord } =
    await import('../src/utils/capturePlanReconciliation.ts');

  const touch = (overrides = {}) => ({
    id: 'c1', accountName: 'MDL', linkedAccountName: '', linkedOpportunityId: '',
    activityType: 'Customer meeting', activityDate: '2026-07-22', nextAction: '', dueDate: '',
    nextActions: [], summary: '', ...overrides,
  });

  // Forward: the capture tells the seller exactly what landed on the plan.
  const scheduled = getCaptureScheduledEntries(
    touch({ nextAction: 'Send revised quote', dueDate: '2026-07-24' }), '2026-07-22',
  );
  assert.equal(scheduled.length, 1, 'a dated next action is reported as scheduled');
  assert.equal(scheduled[0].label, 'Send revised quote');
  assert.equal(scheduled[0].overdue, false);

  // Backward: an open planned item on the same account near the touch can be
  // closed from Capture - suggested, never auto-ticked.
  const planned = createPersonalPlanRecord({ date: '2026-07-22', label: 'Follow up with MDL', tag: 'MDL' });
  const closable = findClosablePlanItems({
    activity: touch(), opportunities: [], records: [planned], today: '2026-07-22',
  });
  assert.equal(closable.length, 1, 'the planned item this touch satisfied is offered for closing');
  assert.equal(closable[0].item.kind, 'personal');

  const doneRecord = planItemDoneRecord(closable[0].item, [planned]);
  assert.equal(doneRecord.done, true, 'marking it produces a done record');
  assert.ok(doneRecord.doneAt, 'with a timestamp');

  // A touch with no account matches nothing - no fishing for items to close.
  assert.equal(
    findClosablePlanItems({ activity: touch({ accountName: '' }), opportunities: [], records: [planned], today: '2026-07-22' }).length,
    0,
    'a touch with no account offers nothing to close',
  );

  // The window must not be cut off by a month edge: a touch on the 30th and an
  // item planned for the 1st are two days apart, not a month.
  const acrossMonth = createPersonalPlanRecord({ date: '2026-08-01', label: 'Follow up with MDL', tag: 'MDL' });
  assert.equal(
    findClosablePlanItems({
      activity: touch({ activityDate: '2026-07-30' }), opportunities: [], records: [acrossMonth], today: '2026-07-30',
    }).length,
    1,
    'an item just across a month boundary is still offered for closing',
  );

  // The Capture page wires both directions and adds no new API function.
  const capturePage = readFileSync(new URL('../src/features/dailyCapture/DailyCapturePage.tsx', import.meta.url), 'utf8');
  assert.match(capturePage, /getCaptureScheduledEntries/, 'Capture reports what it scheduled');
  assert.match(capturePage, /findClosablePlanItems/, 'Capture offers to close matching planned items');
  assert.match(capturePage, /Added to your/, 'Capture tells the seller the plan is in step');
}

// 9. Instrumentation ships with the feature.
{
  const analytics = readFileSync(new URL('../src/utils/productAnalytics.ts', import.meta.url), 'utf8');
  // Behaviour, not page opens. `weekly_plan_opened` counted which room the
  // seller walked into; what the board is for is creating and keeping dated
  // commitments, and those are what it now reports.
  ['commitment_created', 'commitment_completed'].forEach((eventName) => {
    assert.match(analytics, new RegExp(`'${eventName}'`), `${eventName} is a tracked behaviour event`);
  });

  const board = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
  assert.match(board, /trackProductEvent\('commitment_created'\)/, 'adding a dated item is a commitment created');
  assert.match(board, /trackProductEvent\('commitment_completed'\)/, 'ticking an item is a commitment kept');
}

// 10. The data-mode pill reports the real workspace mode. Rendering it with no
//     props made Plan claim "Browser only" while the header said "Cloud +
//     browser" - two surfaces disagreeing about where the data lives.
{
  const page = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /isAuthenticated=\{isAuthenticated\}/, 'the pill is told whether the user is signed in');
  assert.match(page, /cloudAvailable=\{canUseSalesActivityCloudStore\(dataUserId\)\}/, 'the pill is told whether cloud is reachable');
}

// 11. A line on the week can be edited in full - the day, the customer, the
//     person it is with, the wording - and every field is written into the
//     record that owns it. Which fields are editable is decided by where the
//     field lives, never by what would be convenient on a calendar.
{
  const {
    applyPersonalPlanEdit,
    buildCaptureEditChanges,
    buildPlanItemEditDraft,
    captureEditUnlinksDeal,
    planItemEditPolicy,
  } = await import('../src/utils/planItemEdit.ts');

  const boardOf = (input) => buildPlanBoard({
    periodType: 'week', anchorDate: anchor, obligations: [], today: '2026-07-22',
    opportunities: [], activities: [], records: [], ...input,
  });
  const itemOn = (board, date) => board.days.find((day) => day.date === date).items[0];

  // 11a. The draft is read from the owning record, never from the card. The
  //      board condenses a long capture title to fit a day column, so editing
  //      what is on screen would silently truncate what the operator wrote.
  {
    const longTitle = 'Send the revised quotation with the CoA and the updated lead time to purchasing before Friday';
    const touch = {
      id: 'a1', accountName: 'MDL', linkedAccountName: '', linkedOpportunityId: '', linkedOpportunityName: '',
      activityType: 'Customer meeting', activityDate: '2026-07-20', summary: '', linkStatus: 'Unlinked',
      nextAction: longTitle, dueDate: '2026-07-22', nextActions: [], stakeholderName: 'Mr. Phuoc',
      stakeholderRole: 'Purchasing', createdAt: '', updatedAt: '', storageMode: 'local',
    };
    const item = itemOn(boardOf({ activities: [touch] }), '2026-07-22');
    assert.notEqual(item.label, longTitle, 'the card condenses a long capture title');

    const draft = buildPlanItemEditDraft(item, { records: [], opportunities: [], activities: [touch] });
    assert.equal(draft.label, longTitle, 'the drawer opens with the whole sentence the operator wrote');
    assert.equal(draft.contactName, 'Mr. Phuoc', 'and with the person the touch was captured against');
    assert.equal(draft.contactRole, 'Purchasing');
  }

  // 11b. Where a field lives decides whether this surface may write it. A deal
  //      item may be rescheduled and reworded; its customer and decision maker
  //      belong to the opportunity, and moving those from a day column would
  //      move the deal's money and history with them.
  {
    const deal = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
    const dealPolicy = planItemEditPolicy(itemOn(boardOf({ opportunities: [deal] }), '2026-07-20'));
    assert.deepEqual(dealPolicy.fields, { label: true, date: true, account: false, contact: false, channel: false });
    assert.ok(dealPolicy.lockedReason, 'and the drawer says why, rather than hiding the fields');
    assert.match(dealPolicy.ownerHref, /opportunityId=o1/, 'with a link to the record that owns them');

    const obligationPolicy = planItemEditPolicy(
      itemOn(boardOf({ obligations: [obligation('e1', 'VAT payment', 'Tax office', '2026-07-23')] }), '2026-07-23'),
    );
    assert.deepEqual(
      obligationPolicy.fields,
      { label: false, date: false, account: false, contact: false, channel: false },
      'an obligation is held by the quote or expense behind it, so nothing here is editable',
    );
    assert.ok(obligationPolicy.lockedReason, 'and the drawer names the record that does hold the date');

    const typed = createPersonalPlanRecord({ date: '2026-07-21', label: 'Business trip claim' });
    const typedPolicy = planItemEditPolicy(itemOn(boardOf({ records: [typed] }), '2026-07-21'));
    assert.deepEqual(typedPolicy.fields, { label: true, date: true, account: true, contact: true, channel: true });
    assert.equal(typedPolicy.deletable, true, 'a line you typed is yours to remove');
  }

  // 11c. A typed line takes every field. The customer only becomes a *link*
  //      when the workspace already knows it - a name typed by hand stays an
  //      unresolved tag on purpose, because the panel below the board offers to
  //      create exactly those and skips any record that already claims a link.
  {
    const record = createPersonalPlanRecord({ date: '2026-07-20', label: '[Internal] Submit KPI' });
    const moved = applyPersonalPlanEdit(record, {
      label: 'Submit KPI and the quarterly claim',
      date: '2026-07-23',
      accountName: 'Trust Farma',
      accountKind: '',
      opportunityId: '',
      opportunityName: '',
      contactName: 'Ms. Yen',
      contactRole: '',
    });
    assert.equal(moved.date, '2026-07-23', 'the day moves');
    assert.equal(moved.label, 'Submit KPI and the quarterly claim');
    assert.equal(moved.tag, 'Trust Farma', 'the customer is written as the tag');
    assert.equal(moved.linkedStakeholderName, 'Ms. Yen', 'and the person is kept as a field, not buried in the words');
    assert.equal(
      moved.linkedAccountName,
      undefined,
      'a customer Memoire does not know yet stays unresolved, so it can still be offered as an account to create',
    );

    const linked = applyPersonalPlanEdit(record, {
      label: 'Submit KPI', date: '2026-07-20', accountName: 'MDL', accountKind: 'deal',
      opportunityId: 'o1', opportunityName: 'MDL deal', contactName: '', contactRole: '',
    });
    assert.equal(linked.linkedAccountName, 'MDL', 'a customer picked from the workspace is linked');
    assert.equal(linked.linkedOpportunityId, 'o1', 'and so is the deal it was picked from');

    // The store rebuilds a plan record field by field, so a field missing from
    // the sanitizer is a field deleted on the next write: the contact would
    // save, survive one render, and be gone after a reload.
    const planStore = readFileSync(new URL('../src/services/planItemStore.ts', import.meta.url), 'utf8');
    assert.match(
      planStore,
      /linkedStakeholderName: typeof candidate\.linkedStakeholderName === 'string'/,
      'the plan item store keeps the contact through a round trip',
    );
  }

  // 11d. A capture edit rewrites only the action it came from, and settles the
  //      deal link at the same time. The board reads `linkedAccountName ||
  //      accountName`, so correcting the customer while leaving a stale link
  //      would show the old customer back on screen with nothing saying why.
  {
    const touch = {
      id: 'a1', accountName: 'MDL', linkedAccountName: 'MDL', linkedOpportunityId: 'o1',
      linkedOpportunityName: 'MDL deal', linkStatus: 'Linked', activityType: 'Customer meeting',
      activityDate: '2026-07-20', summary: '', nextAction: 'Send quote', dueDate: '2026-07-22',
      nextActions: [{ title: 'Book the visit', dueDate: '2026-07-23' }],
      createdAt: '', updatedAt: '', storageMode: 'local',
    };
    const board = boardOf({ activities: [touch] });
    const headline = itemOn(board, '2026-07-22');
    const structured = itemOn(board, '2026-07-23');

    const rescheduled = buildCaptureEditChanges({
      activity: touch, item: structured, slot: 'n0',
      draft: {
        label: 'Book the visit with purchasing', date: '2026-07-24', accountName: 'MDL', accountKind: 'deal',
        opportunityId: 'o1', opportunityName: 'MDL deal', contactName: 'Mr. Phuoc', contactRole: 'Purchasing',
      },
    });
    assert.equal(rescheduled.nextAction, undefined, 'a structured action moving must not drag the headline with it');
    assert.equal(rescheduled.dueDate, undefined);
    assert.deepEqual(
      rescheduled.nextActions,
      [{ title: 'Book the visit with purchasing', dueDate: '2026-07-24' }],
      'only the slot the card came from is rewritten',
    );
    assert.equal(rescheduled.stakeholderName, 'Mr. Phuoc', 'the person lands on the touch');
    assert.equal(rescheduled.linkStatus, 'Linked', 'and the same customer keeps the deal link');

    const moved = buildCaptureEditChanges({
      activity: touch, item: headline, slot: 'main',
      draft: {
        label: 'Send quote', date: '2026-07-22', accountName: 'Trust Farma', accountKind: '',
        opportunityId: '', opportunityName: '', contactName: '', contactRole: '',
      },
    });
    assert.equal(moved.accountName, 'Trust Farma', 'the corrected customer is written onto the touch');
    assert.equal(moved.linkedAccountName, '', 'and the link that named the old customer is dropped');
    assert.equal(moved.linkStatus, 'Unlinked');
    assert.equal(moved.linkedOpportunityId, '');
    assert.equal(
      captureEditUnlinksDeal(touch, {
        label: '', date: '', accountName: 'Trust Farma', accountKind: '',
        opportunityId: '', opportunityName: '', contactName: '', contactRole: '',
      }),
      true,
      'and the drawer can warn before the operator commits, not after',
    );
  }

  // 11e. The person a line is with is shown on the board. An edit whose result
  //      never appears on screen is an edit the operator reads as lost.
  {
    const withContact = createPersonalPlanRecord({
      date: '2026-07-20', label: 'Book the visit', tag: 'MDL', linkedStakeholderName: 'Mr. Phuoc',
    });
    assert.equal(
      itemOn(boardOf({ records: [withContact] }), '2026-07-20').contactName,
      'Mr. Phuoc',
      'the board carries the contact through to the card',
    );
    assert.equal(
      itemOn(boardOf({ opportunities: [{ ...opportunity('o1', 'MDL', 'Connect', '2026-07-20'), decisionMaker: 'Mr. Tinh' }] }), '2026-07-20').contactName,
      'Mr. Tinh',
      'a deal item shows the decision maker already on the record',
    );

    const page = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
    assert.match(page, /item\.contactName && !labelNamesContact\(/, 'the card renders the contact, without repeating a name the sentence already has');
    assert.match(page, /onClick=\{\(\) => openDetail\(item\)\}/, 'the pencil opens the line in full');
    assert.match(page, /<PlanItemDetailDrawer/, 'and the drawer is wired into the board');
  }
}

console.log('Weekly plan board contract verified.');
