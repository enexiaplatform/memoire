import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  closePeriodGroupLabel,
  compareClosePeriod,
  LATER_RANK,
  resolveClosePeriod,
  UNKNOWN_RANK,
} from '../src/utils/closePeriod.ts';

/**
 * The pipeline-ordering contract.
 *
 * The opportunity table answers one question before any other: what is still
 * live, and what closes soonest. Two things used to stop it. It sorted on the
 * raw `expectedClosePeriod` string, which is free text holding quarters,
 * relative phrases and dates all at once - so "Next quarter" sorted ahead of
 * "This month" on the alphabet. And it defaulted to last-updated, so won and
 * lost deals sat in the middle of the working list.
 *
 * What is pinned here is the reading, not the wording: the stored field is never
 * rewritten, and a date somebody committed to stays distinguishable from one the
 * app inferred.
 */

const TODAY = '2026-07-30'; // Q3 2026.

const at = (raw) => resolveClosePeriod(raw, TODAY);

// 1. Every form the field actually holds lands on one axis, and they order
//    against each other correctly. This is the bug: as strings, "Next quarter"
//    < "This month" because N < T, so the furthest-out deal sorted first.
{
  const thisMonth = at('This month');
  const nextMonth = at('Next month');
  const nextQuarter = at('Next quarter');

  assert.equal(thisMonth.longLabel, 'Q3 2026');
  assert.equal(nextMonth.longLabel, 'Q3 2026', 'August is still Q3');
  assert.equal(nextQuarter.longLabel, 'Q4 2026');
  assert.ok(compareClosePeriod(thisMonth, nextQuarter) < 0, 'this month closes before next quarter');
  assert.ok(
    'Next quarter'.localeCompare('This month') < 0,
    'the raw strings really do sort the wrong way round - this is what the ranks replace',
  );
}

// 2. An explicit quarter wins, with or without a year written next to it.
{
  assert.equal(at('Q4 2026').longLabel, 'Q4 2026');
  assert.equal(at('Q1 2027').longLabel, 'Q1 2027');
  assert.equal(at('FY27 Q2').longLabel, 'Q2 2027');
  assert.ok(compareClosePeriod(at('Q4 2026'), at('Q1 2027')) < 0, 'a year boundary orders correctly');
  assert.equal(at('Q4 2026').yearInferred, false);
}

// 3. A bare quarter means its next occurrence. The founder import writes bare
//    quarters, and reading "Q1" in July as Q1 of this year would file live
//    pipeline four months in the past.
{
  assert.equal(at('Q3').longLabel, 'Q3 2026', 'the current quarter is still ahead');
  assert.equal(at('Q4').longLabel, 'Q4 2026');
  assert.equal(at('Q1').longLabel, 'Q1 2027', 'Q1 has already gone this year');
  assert.equal(at('Q1').yearInferred, true, 'and the guess is marked as a guess');
}

// 4. A real date is bucketed into its quarter; a bare year is not silently read
//    as 1 January.
{
  assert.equal(at('2026-11-15').longLabel, 'Q4 2026');
  assert.equal(at('2026-11-15').basis, 'date');
  assert.equal(at('2027').rank, UNKNOWN_RANK, 'a year alone names no quarter');
}

// 5. "Later" is not a quarter. Sorting it into one would invent precision the
//    operator deliberately withheld, so it sits after everything dated and
//    before everything blank.
{
  const later = at('Later');
  assert.equal(later.rank, LATER_RANK);
  assert.ok(compareClosePeriod(at('Q4 2030'), later) < 0, 'a named far quarter still beats "later"');
  assert.ok(compareClosePeriod(later, at('')) < 0, '"later" beats saying nothing');
  assert.equal(closePeriodGroupLabel(later), 'Later');
}

// 6. Unreadable text is reported as unreadable, and the operator's own words are
//    kept. Showing "No close date" over text they typed would look like the app
//    lost the field.
{
  const empty = at('');
  assert.equal(empty.rank, UNKNOWN_RANK);
  assert.equal(empty.label, 'No close date');

  const nonsense = at('when the budget lands');
  assert.equal(nonsense.rank, UNKNOWN_RANK);
  assert.equal(nonsense.label, 'when the budget lands', 'their words survive');
  assert.equal(nonsense.raw, 'when the budget lands');
}

// 7. The reading never edits the record. The whole point of deriving is that
//    "Next quarter" and "Q4 2026" stay different facts - one is a commitment,
//    one is our inference - and a forecast that flattens them loses the seam.
{
  const relative = at('Next quarter');
  assert.equal(relative.raw, 'Next quarter', 'the stored wording is carried through untouched');
  assert.equal(relative.basis, 'relative');
  assert.equal(at('Q4 2026').basis, 'quarter');
  assert.notEqual(relative.basis, at('Q4 2026').basis, 'an inferred quarter is distinguishable from a stated one');

  const source = readFileSync('src/utils/closePeriod.ts', 'utf8');
  assert.equal(/localStorage|supabase|fetch\(/.test(source), false, 'the resolver derives, never stores');
}

// 8. Sorting is stable across a full round trip: ranks are numbers, so the same
//    input always produces the same order.
{
  const periods = ['', 'Q1', 'This month', 'Later', 'Q4 2026', '2026-11-15', 'Next quarter'].map(at);
  const once = [...periods].sort(compareClosePeriod).map((period) => period.label);
  const twice = [...periods].reverse().sort(compareClosePeriod).map((period) => period.label);
  assert.deepEqual(once, twice, 'order does not depend on input order');
  assert.equal(once[0], "Q3 '26", 'the soonest close leads');
  assert.equal(once[once.length - 1], 'No close date', 'the undated deal is last');
}

// 9. The table's ordering invariant: live pipeline above closed deals, on every
//    column and in both directions. A default would not survive one click on
//    "Value", where the biggest number in a workspace is usually a deal that
//    already closed.
{
  const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  const comparator = page.match(/function compareOpportunityRows\([\s\S]*?\n}/);
  assert.ok(comparator, 'the row comparator must be readable');
  assert.ok(
    comparator[0].includes('opportunityBand(left) - opportunityBand(right)')
    && comparator[0].indexOf('opportunityBand') < comparator[0].indexOf('directionFactor'),
    'the band must be compared before the sorted column, not after it',
  );

  const band = page.match(/function opportunityBand\([\s\S]*?\n}/);
  assert.ok(band, 'the band function must be readable');
  assert.ok(band[0].includes("'Won'") && band[0].includes("'Lost'"), 'won and lost deals share the last band');

  assert.ok(
    /useState<OpportunitySortKey>\('closePeriod'\)/.test(page),
    'the table opens on close period, not on last-updated',
  );
  assert.ok(
    page.includes('return row.closePeriod.rank;'),
    'the close column must sort on the resolved rank, not the raw string',
  );
}

// 10. Column diet. The optional columns appear only when a row has something in
//     them, and probability is judged on open deals only - Won is 100% and Lost
//     is 0% by definition, so counting them would raise the column in every
//     workspace that has ever closed a deal to repeat what Stage already says.
{
  const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  const visibility = page.match(/function buildOpportunityColumnVisibility\([\s\S]*?\n}/);
  assert.ok(visibility, 'column visibility must be derived, not hard-coded');
  for (const field of ['fy26', 'fy27', 'probability', 'brand']) {
    assert.ok(visibility[0].includes(`${field}:`), `${field} must be an optional column`);
  }
  assert.ok(
    visibility[0].includes('opportunityBand(row) === 0 && typeof row.opportunity.pipelineProbability'),
    'probability visibility must ignore closed deals',
  );

  // The four columns the diet removed must be gone as columns, not merely
  // narrowed: the table was unreadable because it was 2040px wide.
  assert.equal(
    /min-w-\[2040px\]/.test(page),
    false,
    'the master table must no longer reserve 2040px of horizontal scroll',
  );
  assert.equal(
    page.includes('function OpportunitySalesFlowCell'),
    false,
    'the sales-flow paragraph column is folded under Stage',
  );
}

// 11. A group heading has to mean one thing. Grouping purely by quarter put two
//     live deals, a won deal and a lost one under "No close date - 3.23B VND",
//     and that total is a number about nothing.
{
  const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  const heading = page.match(/function groupHeadingFor\([\s\S]*?\n}/);
  assert.ok(heading, 'the group heading must be derived in one place');
  assert.ok(heading[0].includes('opportunityBand(row)'), 'headings split on band before quarter');
  assert.ok(
    /key: 'closed'[\s\S]*?showValue: false/.test(heading[0]),
    'a won deal plus a lost deal is not a money total worth printing',
  );
}

console.log('Pipeline ordering contract verified: one close-date axis, live pipeline first, nine columns.');
