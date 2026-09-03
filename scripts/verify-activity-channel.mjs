import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIVITY_CHANNELS,
  inferActivityChannel,
  isOutOfOfficeChannel,
  normalizeActivityChannel,
} from '../src/utils/activityChannel.ts';
import { buildPlanCompletionActivity } from '../src/utils/planCompletionLog.ts';

// An activity carries two independent facts: what it was about (`activityType`)
// and how it happened (`activityChannel`). These pin the parts of that split
// that go wrong quietly - a vocabulary that folds back into one field, a
// surface that writes a completion nowhere, a holiday that switches off a
// customer's silence alarm.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// 1. The two dimensions stay two. `activityType` says the subject and
//    `activityChannel` says the setting; the moment a channel value appears in
//    the type list, "demo" stops being countable because half of them are
//    filed as "Online demo".
{
  const classifier = read('src/utils/salesActivityClassifier.ts');
  const typeUnion = classifier.slice(
    classifier.indexOf('export type SalesActivityType'),
    classifier.indexOf('export type SalesActivityNextAction'),
  );
  ACTIVITY_CHANNELS.forEach(({ channel }) => {
    assert.ok(
      !typeUnion.includes(`'${channel}'`),
      `"${channel}" is a channel and must not also be a SalesActivityType - see src/utils/activityChannel.ts`,
    );
  });
}

// 2. "Not stated" survives. Every record written before 2026-09-03 has no
//    channel, and any default here invents months of days nobody worked.
{
  assert.equal(normalizeActivityChannel(''), '', 'an empty channel stays empty');
  assert.equal(normalizeActivityChannel(undefined), '', 'a missing channel stays empty');
  assert.equal(normalizeActivityChannel('Sales Visit'), '', 'an unknown value is not coerced into a neighbour');
  assert.equal(inferActivityChannel('Price still under discussion'), '', 'a note with no signal offers nothing');
}

// 3. A day off is read as a day off, even when the sentence also names a
//    customer visit. Reversing the rule order turns "nghỉ lễ, không đi khách"
//    into a site visit made on a public holiday, and the holiday disappears.
{
  assert.equal(inferActivityChannel('Nghỉ lễ, không đi khách'), 'Out of office');
  assert.equal(inferActivityChannel('nghi le, khong di khach'), 'Out of office');
  assert.equal(inferActivityChannel('Cold call to a new lab'), 'Cold outreach', 'a cold call is not a plain phone call');
}

// 4. A day out of the office never lands on a customer. This is the one that
//    fails silently: an alarm that fires late gets noticed, an alarm switched
//    off by a public holiday never fires at all.
{
  const item = {
    id: 'p1', kind: 'personal', date: '2026-09-02', tag: 'Frulact', label: 'Follow up',
    done: true, href: '', overdue: false, workKind: 'customer', workBrand: '', workDomain: null,
    channel: 'Out of office',
  };
  const log = buildPlanCompletionActivity({
    item, note: 'Public holiday.', opportunities: [], activityDate: '2026-09-02',
  });
  assert.ok(log, 'a note with content produces a record');
  assert.equal(log.accountName, '', 'a holiday reaches no customer');
  assert.equal(log.activity.accountName, '');
  assert.equal(log.activity.opportunityName, '');
  assert.ok(isOutOfOfficeChannel(log.activity.activityChannel));
}

// 5. Ticking a box records the same thing on both surfaces.
//
//    Until 2026-09-03 the Plan board wrote a completion mark and stopped, while
//    Today's strip offered to write the work to Activity - so an operator who
//    ran their week from Plan produced a full calendar and an empty ledger. Both
//    call `buildPlanCompletionActivity` now, and a surface that stops calling it
//    has either lost the offer or grown a second definition of the record.
{
  const surfaces = [
    'src/features/plan/WeeklyPlanPage.tsx',
    'src/features/dashboard/TodayCommitmentStrip.tsx',
  ];
  //
  //    Matched with word boundaries rather than `includes`, because a substring
  //    check passes on anything that merely starts with the name: renaming the
  //    component to `LogToActivityBoxV2` would still contain `<LogToActivityBox`
  //    and this contract would go on saying the offer was there.
  surfaces.forEach((path) => {
    const source = read(path);
    assert.match(
      source, /\bbuildPlanCompletionActivity\(/,
      `${path} must build its completion touch with the shared writer`,
    );
    assert.match(
      source, /<LogToActivityBox[\s/>]/,
      `${path} must offer to log a ticked item to Activity`,
    );
    assert.match(
      source, /\bawait saveSalesActivity\(/,
      `${path} must actually write the touch it offered to write`,
    );
  });

  // One definition of the record, not two that drift.
  const strip = read('src/features/dashboard/TodayCommitmentStrip.tsx');
  assert.ok(
    !/tags:\s*\['plan-completion'/.test(strip),
    'the completion record is built in utils/planCompletionLog.ts, not inline on a surface',
  );
}

// 6. The channel reaches the database. A field the UI collects and the store
//    drops is worse than no field: the operator sees it save and it is gone.
{
  const store = read('src/services/salesActivityStore.ts');
  assert.ok(store.includes('activity_channel: normalizeActivityChannel(activity.activityChannel) || null'),
    'a new capture writes its channel');
  assert.ok(store.includes('activityChannel: normalizeActivityChannel(row.activity_channel)'),
    'a cloud row reads its channel back');
  assert.ok(store.includes('activity_channel: normalizeActivityChannel(updated.activityChannel) || null'),
    'an edited channel is sent to the cloud, not only held in memory');

  const migration = read('supabase/migrations/20260903090000_sales_activity_channel.sql');
  assert.match(migration, /add column if not exists activity_channel text/,
    'the column the store writes to has a migration');
}

// 6b. The plan record survives its own store.
//
//     `sanitizePlanRecord` rebuilds a plan item field by field on every write,
//     so a field missing from it is a field the store silently deletes: the
//     channel saves, survives one render, and is gone after a reload. That is
//     precisely how this shipped the first time - the browser check caught it,
//     nothing in the type system did, because every field there is optional.
{
  const store = read('src/services/planItemStore.ts');
  const sanitizer = store.slice(store.indexOf('function sanitizePlanRecord'));
  assert.match(sanitizer, /channel: normalizeActivityChannel\(candidate\.channel\),/,
    'sanitizePlanRecord must carry the channel through, or every write drops it');
}

// 7. Desk work and days off do not reset a customer's silence clock, and a
//    record with no channel still counts as a touch - otherwise every row
//    written before the field existed would read as silence.
{
  const insights = read('src/utils/activityInsights.ts');
  assert.ok(insights.includes('if (isNonCustomerChannel(activity.activityChannel)) return;'),
    'buildQuietAccounts skips touches that had nobody on the other side');
  assert.match(insights, /return spec \? spec\.customerFacing === false : false;/,
    'an unstated channel is never treated as internal');
}

console.log('Activity channel contract OK');
