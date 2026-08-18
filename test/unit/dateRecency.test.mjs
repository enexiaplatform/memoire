import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareSafeBusinessDate, isMoreRecentBusinessDate } from '../../src/utils/safeDate.ts';
import { buildActivityAnalytics } from '../../src/utils/activityAnalytics.ts';
import { buildFollowUpImpact } from '../../src/utils/followUpImpact.ts';
import { buildRetentionSignals } from '../../src/utils/retentionSignals.ts';

/**
 * The one comparison this product must not get backwards.
 *
 * `compareSafeBusinessDate` puts unreadable dates *after* readable ones, which
 * is right for a list and wrong for the three places that were keeping "the
 * most recent" by asking whether one date sorted after another - the last
 * touch on a subject, the newest outcome on a deal, the latest paid quote on an
 * account. None of the three filtered first. Under that reading
 * an unparseable date is the newest thing that ever happened, so a single bad
 * row - `03/04/2026` out of a dd/mm import - made a customer look touched today
 * and took them off the going-quiet list. The promise on the landing page is
 * that nothing goes silent; this is the bug that quietly broke it.
 */

describe('recency never reads an unreadable date as the newest', () => {
  test('the sort helper still puts unreadable dates last, which is what made it dangerous here', () => {
    assert.ok(compareSafeBusinessDate('03/04/2026', '2026-07-09') > 0, 'sorting contract unchanged');
  });

  test('an unreadable candidate never wins', () => {
    assert.equal(isMoreRecentBusinessDate('03/04/2026', '2026-07-09'), false);
    assert.equal(isMoreRecentBusinessDate('', '2026-07-09'), false);
    assert.equal(isMoreRecentBusinessDate(undefined, '2026-07-09'), false);
  });

  test('an unreadable incumbent always loses, so one readable date decides the set', () => {
    assert.equal(isMoreRecentBusinessDate('2026-07-09', '03/04/2026'), true);
    assert.equal(isMoreRecentBusinessDate('2026-07-09', undefined), true);
  });

  test('two readable dates compare as before', () => {
    assert.equal(isMoreRecentBusinessDate('2026-07-10', '2026-07-09'), true);
    assert.equal(isMoreRecentBusinessDate('2026-07-09', '2026-07-10'), false);
    assert.equal(isMoreRecentBusinessDate('2026-07-09', '2026-07-09'), false);
  });
});

const activity = (name, date, id) => ({
  id: id || `${name}-${date}`,
  date,
  kind: 'event',
  state: 'done',
  origin: 'capture',
  domain: 'commercial',
  relatedTo: { type: 'customer', name, href: `/app/accounts?name=${encodeURIComponent(name)}` },
  title: `touch ${name}`,
});

describe('going quiet survives one bad date in the history', () => {
  const today = '2026-08-18';
  const entries = [activity('Readable Co', '2026-07-09'), activity('Import Co', '2026-07-09')];

  test('a customer with one unparseable row is still reported as quiet', () => {
    const analytics = buildActivityAnalytics({
      entries,
      allEntries: [...entries, activity('Import Co', '03/04/2026', 'import-co-bad-row')],
      range: { start: '2026-07-01', end: today },
      today,
    });

    const importCo = analytics.subjects.find((subject) => subject.name === 'Import Co');
    assert.equal(importCo.lastDate, '2026-07-09', 'the readable touch is the last touch');
    assert.equal(importCo.daysSinceLast, 40);
    assert.ok(
      analytics.silentSubjects.some((subject) => subject.name === 'Import Co'),
      'the bad row must not take the customer off the going-quiet list',
    );
  });

  test('no readable date anywhere is unknown, never "touched today"', () => {
    const analytics = buildActivityAnalytics({
      entries: [activity('No Dates Co', '2026-07-09')],
      allEntries: [activity('No Dates Co', '03/04/2026', 'no-dates-row')],
      range: { start: '2026-07-01', end: today },
      today,
    });

    const subject = analytics.subjects.find((row) => row.name === 'No Dates Co');
    assert.equal(subject.daysSinceLast, null, '0 would mean touched today');
    assert.ok(
      analytics.silentSubjects.some((row) => row.name === 'No Dates Co' && row.daysSinceLast === null),
      'unknown recency is surfaced rather than dropped',
    );
  });
});

describe('a follow-up is not called revived by an unreadable touch', () => {
  const today = '2026-08-18';
  const opportunity = {
    id: 'opp-1',
    accountName: 'Import Co',
    opportunityName: 'Q3 supply',
    status: 'Active',
    stage: 'Proposal',
    estimatedValue: '10000',
    currency: 'USD',
  };

  const record = (over) => ({
    accountName: 'Import Co',
    opportunityName: 'Q3 supply',
    linkedOpportunityId: 'opp-1',
    activityType: 'Meeting',
    interactionSummary: 'Talked about the order',
    nextAction: '',
    ...over,
  });

  // The deal was worked in June, went quiet, and was chased on 2026-08-01.
  const followUp = record({
    id: 'act-follow-up',
    activityDate: '2026-08-01',
    activityType: 'Follow-up',
    interactionSummary: 'Sent the follow-up',
  });
  const oldTouch = record({ id: 'act-old', activityDate: '2026-06-20' });

  test('a readable later touch is still evidence the customer came back', () => {
    const impact = buildFollowUpImpact({
      opportunities: [opportunity],
      activities: [oldTouch, followUp, record({ id: 'act-reply', activityDate: '2026-08-05' })],
      today,
    });

    assert.equal(impact.events.length, 1, 'the follow-up produced an event');
    assert.equal(impact.events[0].status, 'revived');
  });

  test('an activity whose date will not parse cannot count as the later touch', () => {
    const impact = buildFollowUpImpact({
      opportunities: [opportunity],
      activities: [oldTouch, followUp, record({ id: 'act-bad-row', activityDate: '03/04/2026' })],
      today,
    });

    assert.equal(impact.events.length, 1, 'the follow-up still produced an event');
    assert.notEqual(
      impact.events[0].status,
      'revived',
      'an unreadable date must not be evidence that the customer came back',
    );
  });
});

describe('the latest paid quote is the latest readable one', () => {
  const today = '2026-08-18';
  const quote = (over) => ({
    id: over.id,
    accountName: 'Import Co',
    opportunityName: 'Q3 supply',
    status: 'Accepted',
    paymentStatus: 'Paid',
    amount: over.amount,
    currency: 'USD',
    title: over.title,
    quoteDate: over.quoteDate,
  });

  test('a quote whose date will not parse does not become the latest for that account', () => {
    const signals = buildRetentionSignals({
      quotes: [
        quote({ id: 'q-real', quoteDate: '2026-02-10', amount: 5000, title: 'February order' }),
        quote({ id: 'q-bad-row', quoteDate: '03/04/2026', amount: 90, title: 'Row from an import' }),
      ],
      opportunities: [],
      accounts: [],
      activities: [],
      today,
    });

    assert.equal(signals.length, 1);
    assert.equal(signals[0].quoteId, 'q-real', 'the readable quote is the one the signal is about');
    assert.equal(signals[0].amount, 5000);
  });
});
