import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyDigest,
  buildWeeklyDigest,
  localHourInZone,
  renderDigestEmail,
  todayInZone,
} from '../../api/_digest.js';

/**
 * The digest is the first thing this product says to somebody who is not
 * looking at it, so the two ways it can be wrong both matter: saying nothing
 * when something is late, and arriving every morning with nothing to say.
 */

const TODAY = '2026-08-02';

const deal = (id, overrides = {}) => ({
  id,
  account_name: `Account ${id}`,
  opportunity_name: `Deal ${id}`,
  stage: 'negotiation',
  status: 'Active',
  next_action: 'Send the revised quote',
  next_action_date: '2026-08-20',
  estimated_value: 100,
  currency: 'VND',
  updated_at: '2026-07-30T00:00:00.000Z',
  ...overrides,
});

const touch = (account, date) => ({ id: `${account}-${date}`, account_name: account, activity_date: date });

const inputs = (overrides = {}) => ({
  opportunities: [], activities: [], quotes: [], errors: [], ...overrides,
});

describe('daily digest: what it decides to say', () => {
  test('an overdue next action is reported with its date', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [deal('a', { next_action_date: '2026-07-28' })],
      activities: [touch('Account a', '2026-08-01')],
    }), TODAY);

    assert.equal(digest.hasSignal, true);
    assert.equal(digest.counts.overdue, 1);
    assert.match(digest.lines.join('\n'), /Send the revised quote \(due 2026-07-28\)/);
  });

  test('a deal with no touch in two weeks is going quiet; a touched one is not', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [deal('quiet'), deal('warm')],
      activities: [touch('Account quiet', '2026-07-01'), touch('Account warm', '2026-08-01')],
    }), TODAY);

    assert.equal(digest.counts.quiet, 1);
    assert.match(digest.lines.join('\n'), /Account quiet/);
    assert.doesNotMatch(digest.lines.join('\n'), /Account warm/);
  });

  test('a closed deal is not chased', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [
        deal('won', { status: 'Won', next_action_date: '2026-07-01' }),
        deal('lost', { status: 'Lost', next_action_date: '2026-07-01' }),
      ],
    }), TODAY);

    assert.equal(digest.hasSignal, false, 'nothing open is nothing to say');
    assert.equal(digest.counts.overdue, 0);
  });

  test('a quote past its payment or delivery date counts as stuck money', () => {
    const digest = buildDailyDigest(inputs({
      quotes: [
        { id: 'q1', accountName: 'Late Pay', title: 'Analyzer', paymentDueDate: '2026-07-20', paymentStatus: 'Due' },
        { id: 'q2', accountName: 'Late Ship', title: 'Reagents', expectedDeliveryDate: '2026-07-25', deliveryStatus: 'Not scheduled' },
        { id: 'q3', accountName: 'Settled', title: 'Paid', paymentDueDate: '2026-07-20', paymentStatus: 'Paid' },
        { id: 'q4', accountName: 'Deleted', title: 'Gone', paymentDueDate: '2026-07-01', paymentStatus: 'Due', __deleted: true },
      ],
    }), TODAY);

    assert.equal(digest.counts.stuckMoney, 2);
    assert.match(digest.lines.join('\n'), /Late Pay/);
    assert.doesNotMatch(digest.lines.join('\n'), /Settled|Deleted/);
  });

  test('a deal that arrived this week has not gone quiet, it has not been worked yet', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [
        deal('fresh', { created_at: '2026-07-30T00:00:00.000Z', next_action_date: '2026-08-20' }),
        deal('stale', { created_at: '2026-05-01T00:00:00.000Z', next_action_date: '2026-08-20' }),
      ],
    }), TODAY);

    assert.equal(digest.counts.quiet, 1, 'only the deal old enough for silence to mean something');
    assert.match(digest.lines.join('\n'), /Account stale/);
    assert.doesNotMatch(digest.lines.join('\n'), /Account fresh/);
  });

  test('an import that lands a whole pipeline does not report the whole pipeline as neglected', () => {
    const justImported = Array.from({ length: 40 }, (_, index) => deal(`i${index}`, {
      created_at: '2026-08-02T01:00:00.000Z',
      next_action_date: '2026-09-01',
    }));

    const digest = buildDailyDigest(inputs({ opportunities: justImported }), TODAY);

    assert.equal(digest.counts.quiet, 0);
    assert.equal(digest.hasSignal, false, 'the first morning after an import has nothing to accuse anybody of');
  });

  test("a deal's own last touch counts, even when no activity row was written", () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [deal('worked', {
        created_at: '2026-05-01T00:00:00.000Z',
        last_touch_at: '2026-08-01T09:00:00.000Z',
        next_action_date: '2026-08-20',
      })],
    }), TODAY);

    assert.equal(digest.counts.quiet, 0);
  });

  test('a quiet morning has no signal, so nothing is sent', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [deal('fine')],
      activities: [touch('Account fine', '2026-08-01')],
    }), TODAY);

    assert.equal(digest.hasSignal, false);
    assert.match(digest.subject, /nothing needs you today/);
  });
});

describe('weekly digest: what the week produced', () => {
  test('counts what closed inside the window and what is still open', () => {
    const digest = buildWeeklyDigest(inputs({
      opportunities: [
        deal('won', { status: 'Won', updated_at: '2026-07-30T00:00:00.000Z' }),
        deal('lost', { status: 'Lost', updated_at: '2026-07-29T00:00:00.000Z' }),
        deal('old-win', { status: 'Won', updated_at: '2026-06-01T00:00:00.000Z' }),
        deal('open'),
      ],
      activities: [touch('Account open', '2026-07-31'), touch('Account open', '2026-06-01')],
    }), TODAY);

    assert.equal(digest.counts.won, 1, 'a win from six weeks ago is not this week');
    assert.equal(digest.counts.lost, 1);
    assert.equal(digest.counts.touches, 1);
    assert.equal(digest.counts.open, 1);
  });
});

describe('digest email: what leaves the server', () => {
  test('carries both links and never a tracking pixel', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [deal('a', { next_action_date: '2026-07-28' })],
    }), TODAY);
    const email = renderDigestEmail(digest, {
      appUrl: 'https://memoire-official.com/app/today',
      unsubscribeUrl: 'https://memoire-official.com/api/send-digests?token=abc&kind=daily',
    });

    assert.match(email.text, /Open Memoire: https:\/\//);
    assert.match(email.text, /Stop these emails: https:\/\//);
    assert.match(email.html, /Open Memoire/);
    assert.doesNotMatch(email.html, /<img/i, 'no image means no open tracking');
  });

  test('escapes customer text rather than pasting it into markup', () => {
    const digest = buildDailyDigest(inputs({
      opportunities: [deal('x', {
        account_name: '<script>alert(1)</script>',
        next_action_date: '2026-07-01',
      })],
    }), TODAY);
    const email = renderDigestEmail(digest, { appUrl: 'https://x', unsubscribeUrl: 'https://y' });

    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
  });
});

describe('digest scheduling: whose morning is it', () => {
  test('local hour and local day follow the offset, not the server', () => {
    // 23:30 UTC on a Sunday is 06:30 Monday in UTC+7.
    const sundayNight = new Date('2026-08-02T23:30:00.000Z');
    assert.equal(localHourInZone(420, sundayNight), 6);
    assert.equal(todayInZone(420, sundayNight), '2026-08-03');
    assert.equal(localHourInZone(0, sundayNight), 23);
    assert.equal(todayInZone(0, sundayNight), '2026-08-02');
  });
});
