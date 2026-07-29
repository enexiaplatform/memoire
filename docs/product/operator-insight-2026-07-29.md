# Operator insight: how you sell, which way it is going, and what the number asks

Date: 2026-07-29
Builds on: `focused-refactor-2026-07-26.md` (the Commercial Kernel and the six destinations)

## Why

Memoire could read a period and it could read a deal. It could not read the person.

Everything analytical in the product was scoped one of two ways. Period-scoped: the activity band comparing this week with last week, the weekly review, the charts. Deal-scoped: the outcome retros, the forecast calibration, the playbook patterns. Both are useful and neither answers the question a seller genuinely cannot answer about themselves - *what is normal for me?* How long does one of my deals actually take. How many touches separate the ones I win from the ones I lose. Which size of deal am I quietly bad at. Which day of my week never contains a customer.

The second missing half was on the money side. Coverage answers "am I going to make the number", and stops exactly where the useful part starts: a shortfall expressed in money is not something a person can act on. Nothing turned the gap into pipeline, deals, quotes, per week - and nothing could say the most valuable thing in the shortfall, which is that the quarter is sometimes already shorter than one of your own deals.

## What was built

Three derived engines, no new stores, no new `api/` functions (the Vercel function cap is untouched), and no seventh destination.

**`src/utils/operatorProfile.ts`** - the accumulating portrait. Seven readings: sales cycle, typical deal size, win rate, touches behind a win, win rate by deal size, the shape of your week, how fast you come back. Plus `unusuallyQuiet`: accounts off *their own* touch rhythm. Plus `economics`, the machine-readable rates other engines multiply with.

**`src/utils/metricTrend.ts`** - direction over several completed periods, for five weekly metrics. Not a delta: one bad week against one good week is weather.

**`src/utils/targetPlan.ts`** - the quarter's gap turned into wins, pipeline, deals and quotes, at the seller's own rates, per week, with the routes it can still come from.

Surfaced in two places that already own the questions: `OperatorProfileSection` at the top of Review > Analytics, `TargetPlanPanel` directly under Coverage on Money.

## The rules that make it trustworthy

A profile that is wrong once is never trusted again, so the constraints are the feature:

1. **Nothing is claimed below a minimum sample.** A reading is either earned or it is not emitted at all - it appears in `gaps` instead, naming how many records it still needs and what reaching that number would tell you. Two closed deals is an anecdote.
2. **A missing rate stays null, all the way down.** `OperatorEconomics` returns null below its minimum; `buildTargetPlan` turns a null rate into a null requirement and a named entry in `missing`. No defaults, no benchmarks, no industry averages.
3. **The period still running never votes.** A Wednesday is not a bad week yet.
4. **A direction needs four completed periods and has to clear a dead-band** - three moves the same way, or a 25% change between halves. Everything else is `steady`, which is usually the truth.
5. **A percentage needs a base worth taking a percentage of.** One deal opened last week and none this week is a 100% collapse by arithmetic and nothing at all in life. Counts below three are `unreadable` unless there is a real run.
6. **It reads and reports. It changes nothing.** `unusuallyQuiet` is deliberately the *observation* form of adaptive thresholds: it says an account is off its normal pace and leaves the daily alarms on the fixed, published threshold in `policyEngine.ts`. Pinned by the contract - `operatorProfile.ts` may not reference `policyThresholds`.
7. **Every money figure carries its currency.** A bare amount inside a sentence is the exact shape of the bug that once printed a VND figure labelled SGD.

## Found by running it

Two real defects, both caught on the demo workspace rather than by the tests:

1. **A false alarm on the first render.** "New deals opened is down 100%" was headlining a workspace that went from one new deal a week to none. Arithmetically true, editorially worthless, and precisely the kind of line that teaches a user to stop reading a panel. Rule 5 above is the fix.
2. **Money without a currency.** The profile's readings were composing amounts with `toLocaleString`, so the deal-size reading said "320,000,000" with nothing to say what of. Now `formatCompactBaseAmount`, like the rest of the app.

A third, found while writing the size-band reading: splitting win rate at the *won* median leaves the small band empty for a seller whose wins are all small - hiding exactly the pattern the reading exists to find. The split comes from all closed deals.

## Verification

- `npm run check` green, including the new `verify:operator-insight`.
- 336 unit tests pass (34 new across `operatorProfile`, `metricTrend`, `targetPlan`).
- Demo sandbox: Review > Analytics renders the profile with two earned readings, five honest gaps, and no false trend; Money renders the target plan against a 5B Q3 target (short 2.1B, 7 wins needed, 11 deals in play, ~1.1 a week, quotes blank because quote conversion is not known yet).
- No horizontal overflow from either panel at 375px.

## Deliberately not built

**Adaptive thresholds.** The policy engine's own comment has always said personalisation would eventually override its thresholds per account from the user's history. It still has not, on purpose: an insight panel that is wrong is visible and arguable, while a silently learned threshold changes what the product tells the user every morning and is very hard to trace when it is wrong. The rhythm data now exists and is displayed; wiring it into the alarms is its own decision.

**A Today strip.** Today already carries the cockpit, two commitment lists and Top 3. A weekly-cadence reading does not earn daily space.

**Anything about the market.** Every trend here is the seller's own. Memoire has no external data and is not getting any.
