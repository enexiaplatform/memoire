import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dueKind, sentColumnsFor } from '../../api/send-digests.ts';

/**
 * When the scheduled email is due, and - the part that had no test and was
 * wrong - when it is not.
 *
 * The cron runs hourly and works out whose local hour has arrived. Everything it
 * does is supposed to be idempotent per day, because a cron fires twice, a retry
 * lands late, and a delivery gets duplicated. The unique index in Postgres is not
 * the guard people assume it is: it is keyed on (user, kind, day), so it stops a
 * second *daily* and has nothing to say about a daily following a weekly.
 */

const profile = (overrides = {}) => ({
  id: 'user-1',
  email: 'operator@example.com',
  display_name: 'Operator',
  daily_digest_enabled: true,
  weekly_review_enabled: true,
  digest_send_hour: 7,
  digest_utc_offset_minutes: 420, // UTC+7
  digest_last_daily_sent_on: null,
  digest_last_weekly_sent_on: null,
  digest_unsubscribe_token: '00000000-0000-0000-0000-000000000000',
  ...overrides,
});

/** 07:00 local in UTC+7 is 00:00 UTC. 2026-08-03 was a Monday. */
const MONDAY_LOCAL_7AM = new Date('2026-08-03T00:00:00Z');
const TUESDAY_LOCAL_7AM = new Date('2026-08-04T00:00:00Z');

describe('digest scheduling: which email is due', () => {
  test('nothing is due outside the operator\'s chosen hour', () => {
    assert.equal(dueKind(profile(), new Date('2026-08-04T03:00:00Z')), null);
  });

  test('the hour is the operator\'s local hour, not UTC', () => {
    // Same instant, two operators. 00:00 UTC is 07:00 in Ho Chi Minh City and
    // 19:00 the previous day in Los Angeles.
    assert.equal(dueKind(profile({ digest_utc_offset_minutes: 420 }), TUESDAY_LOCAL_7AM), 'daily');
    assert.equal(dueKind(profile({ digest_utc_offset_minutes: -420 }), TUESDAY_LOCAL_7AM), null);
  });

  test('the weekly review wins on Monday', () => {
    assert.equal(dueKind(profile(), MONDAY_LOCAL_7AM), 'weekly');
  });

  test('a Monday that runs twice does not send a daily on top of the weekly', () => {
    const afterWeekly = profile(sentColumnsFor('weekly', '2026-08-03'));
    assert.equal(
      dueKind(afterWeekly, MONDAY_LOCAL_7AM),
      null,
      'the weekly already went out this morning; a daily behind it is a second copy',
    );
  });

  test('a daily that already went out is not sent again', () => {
    const afterDaily = profile(sentColumnsFor('daily', '2026-08-04'));
    assert.equal(dueKind(afterDaily, TUESDAY_LOCAL_7AM), null);
  });

  test('Monday\'s weekly does not suppress the rest of the week', () => {
    const afterWeekly = profile(sentColumnsFor('weekly', '2026-08-03'));
    assert.equal(dueKind(afterWeekly, TUESDAY_LOCAL_7AM), 'daily');
  });

  test('a daily on Sunday does not suppress Monday\'s weekly review', () => {
    const afterSundayDaily = profile(sentColumnsFor('daily', '2026-08-02'));
    assert.equal(dueKind(afterSundayDaily, MONDAY_LOCAL_7AM), 'weekly');
  });

  test('Monday falls through to the daily when the weekly is turned off', () => {
    assert.equal(dueKind(profile({ weekly_review_enabled: false }), MONDAY_LOCAL_7AM), 'daily');
  });

  test('an operator who wants neither is sent neither', () => {
    const off = profile({ daily_digest_enabled: false, weekly_review_enabled: false });
    assert.equal(dueKind(off, MONDAY_LOCAL_7AM), null);
    assert.equal(dueKind(off, TUESDAY_LOCAL_7AM), null);
  });

  test('a weekly-only operator hears nothing on a Tuesday', () => {
    assert.equal(dueKind(profile({ daily_digest_enabled: false }), TUESDAY_LOCAL_7AM), null);
  });
});

describe('digest scheduling: what a send stamps', () => {
  test('a weekly send stamps both columns, a daily send only its own', () => {
    assert.deepEqual(sentColumnsFor('weekly', '2026-08-03'), {
      digest_last_weekly_sent_on: '2026-08-03',
      digest_last_daily_sent_on: '2026-08-03',
    });
    assert.deepEqual(sentColumnsFor('daily', '2026-08-04'), {
      digest_last_daily_sent_on: '2026-08-04',
    });
  });
});
