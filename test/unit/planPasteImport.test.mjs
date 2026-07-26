import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanPaste } from '../../src/utils/planPasteImport.ts';
import { buildPlanBoard } from '../../src/utils/weeklyPlan.ts';

// The week of Mon 2026-07-27 .. Sun 2026-08-02, as the board would render it.
const days = buildPlanBoard({
  periodType: 'week',
  anchorDate: new Date(2026, 6, 29),
  opportunities: [], obligations: [], records: [],
  today: '2026-07-27',
}).days;

const parse = (text, existing = []) => parsePlanPaste({ text, days, existing });

describe('parsePlanPaste', () => {
  test('reads a real hand-written week onto the right days', () => {
    // Taken verbatim from a weekly plan drafted outside the app.
    const result = parse(`
Monday
[Internal] Weekly meeting
[FKV] Connect Ms. Yen & Ms. Mai
[Bidiphar] Asking sample from PMM

Tuesday
[Cobetter] Research market & product
[Masan] Follow up & Meeting

Wednesday
[DP Lab] Meeting
[DPLab] Pricing for Conda

Friday
On-leave
`);

    assert.equal(result.lines.length, 8);
    assert.equal(result.newCount, 8);
    assert.equal(result.unassigned.length, 0);

    const monday = result.lines.filter((line) => line.date === '2026-07-27');
    assert.equal(monday.length, 3);
    assert.deepEqual(monday.map((line) => line.tag), ['Internal', 'FKV', 'Bidiphar']);
    assert.equal(monday[1].label, 'Connect Ms. Yen & Ms. Mai');

    // A line with no bracket keeps its whole text and carries no tag.
    const friday = result.lines.find((line) => line.date === '2026-07-31');
    assert.equal(friday.tag, '');
    assert.equal(friday.label, 'On-leave');
  });

  test('accepts the bullets and numbering people paste from notes', () => {
    const result = parse(`
Mon:
- [FKV] Connect Ms. Yen
* [DCL] Booking meeting
1. [Global] Follow up contract
[ ] [Masan] Meeting
`);
    assert.equal(result.lines.length, 4);
    assert.deepEqual(result.lines.map((line) => line.tag), ['FKV', 'DCL', 'Global', 'Masan']);
    assert.equal(result.lines.every((line) => line.date === '2026-07-27'), true);
  });

  test('a day written with its date is still a heading', () => {
    const result = parse('Monday Jul 27\n[FKV] Connect Ms. Yen');
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].date, '2026-07-27');
  });

  test('a line that merely mentions a day is work, not a heading', () => {
    const result = parse('Monday\n[FKV] Call Ms. Mai on Monday about the tender');
    assert.equal(result.lines.length, 1);
    assert.match(result.lines[0].label, /Call Ms. Mai on Monday/);
  });

  test('lines before any day are handed back, never guessed onto a day', () => {
    const result = parse(`
Draft plan for next week
[FKV] Connect Ms. Yen

Monday
[DCL] Booking meeting
`);
    assert.deepEqual(result.unassigned, ['Draft plan for next week', '[FKV] Connect Ms. Yen']);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].tag, 'DCL');
  });

  test('pasting the same week twice does not double the board', () => {
    const first = parse('Monday\n[FKV] Connect Ms. Yen & Ms. Mai');
    const existing = first.lines.map((line, index) => ({
      id: `r${index}`, date: line.date, label: line.label, tag: line.tag,
      done: false, createdAt: '', updatedAt: '',
    }));

    const second = parse('Monday\n[FKV] Connect Ms. Yen & Ms. Mai', existing);
    assert.equal(second.lines.length, 1);
    assert.equal(second.duplicateCount, 1);
    assert.equal(second.newCount, 0);
  });

  test('two customers with the same words on one day are two items', () => {
    // Straight from a real week: "[Achison] Meeting" and "[KN] Meeting" both sit
    // on Thursday. Keying only on the day and the words drops one of them.
    const result = parse('Thursday\n[Achison] Meeting\n[KN] Meeting');
    assert.equal(result.newCount, 2);
    assert.equal(result.duplicateCount, 0);
    assert.deepEqual(result.lines.map((line) => line.tag), ['Achison', 'KN']);
  });

  test('the same line twice inside one paste is only created once', () => {
    const result = parse('Monday\n[FKV] Connect Ms. Yen\n[FKV] Connect Ms. Yen');
    assert.equal(result.newCount, 1);
    assert.equal(result.duplicateCount, 1);
  });

  test('text under a heading that is not a day is handed back whole', () => {
    // "Someday" names no weekday, so it is not a heading and nothing under it
    // can be placed. Both lines come back rather than landing on a guessed day.
    const result = parse('Someday\n[FKV] Connect Ms. Yen');
    assert.deepEqual(result.unassigned, ['Someday', '[FKV] Connect Ms. Yen']);
    assert.equal(result.lines.length, 0);
  });

  test('a real weekday the board is not showing is reported, not absorbed', () => {
    // A board that hides empty weekends still must not attach Saturday's items
    // to Friday.
    const weekdaysOnly = days.filter((day) => !day.isWeekend);
    const result = parsePlanPaste({
      text: 'Friday\n[TrustFarma] Delivery BI\nSaturday\n[KN] Site visit',
      days: weekdaysOnly,
      existing: [],
    });

    assert.equal(result.lines.length, 1, 'only Friday could be placed');
    assert.equal(result.lines[0].tag, 'TrustFarma');
    assert.deepEqual(result.unknownDays, ['Saturday']);
    assert.deepEqual(result.unassigned, ['[KN] Site visit']);
  });

  test('empty text yields nothing and complains about nothing', () => {
    const result = parse('   \n\n  ');
    assert.equal(result.lines.length, 0);
    assert.equal(result.unassigned.length, 0);
    assert.equal(result.newCount, 0);
  });
});
