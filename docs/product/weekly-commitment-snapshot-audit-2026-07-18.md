# Weekly Commitment Snapshot — Pre-implementation audit (2026-07-18)

Required output before coding, per the product-direction brief. Conclusion first:
**the gap is real and narrow.** Memoire generates next-week priorities but never
persists what the user *chose*. Everything downstream — carry-over, drop rate,
plan-vs-actual — is currently impossible to compute honestly.

---

## 1. Current-state audit

The weekly loop today runs across two separate engines plus a snapshot store:

| Layer | File | State |
|---|---|---|
| Weekly Business Review (operator lens) | `src/utils/weeklyBusinessReview.ts` | Pure derivation, no persistence |
| Weekly Execution Review (action/outcome lens) | `src/utils/weeklyExecutionReview.ts` | Pure derivation, no persistence |
| Review Pack (manager artifact) | `src/utils/reviewPacks.ts` | **Persisted + cloud-synced snapshot** |
| Action outcomes | `src/services/actionOutcomeStore.ts` | Persisted, per-action, per-opportunity |
| Review habit (weekId) | `src/utils/pipelineReviewHabit.ts` | Persisted, week-scoped |

Two recommendation surfaces already exist and both are ephemeral:

- `buildNextWeekPriorities()` — `weeklyBusinessReview.ts:228`, returns up to 6
  `NextWeekPriority { id, label, detail, href }`, recomputed from live
  opportunity/quote/initiative state on every render.
- `buildNextWeekFocus()` — `weeklyExecutionReview.ts:409`, returns `string[]`
  of execution-quality themes. Not deal-scoped, not selectable.

## 2. Existing-capability map

Already built — **do not rebuild**:

- Recommendation generation (both engines above, plus
  `opportunityActionPlan.ts`, `todayCommandCenter.ts`, `dailyExecution.ts`).
- Outcome capture per action (`actionOutcomeStore.ts`: `Suggested / Accepted /
  Done / Dismissed` × `Improved / Worsened / No change / …`). This is the
  closest existing thing to a commitment record — but it is *per recommended
  action on one opportunity*, not *the week the user chose*.
- Historical snapshot persistence pattern (`reviewPacks.ts` +
  `cloudJsonCollectionStore.ts`): local-first, cloud-merged, week-scoped,
  sample/demo-tagged. **Reuse this pattern verbatim.**
- Commitment *checking* (`buildCommitmentLedger()`,
  `weeklyBusinessReview.ts:174`) — kept / missed / upcoming with evidence.
- Week identity (`getCurrentPipelineReviewWeekId()`).
- Analytics (`productAnalytics.ts`, 23 funnel events, POSTs to
  `/api/request-access`).

## 3. Exact missing gap

One sentence: **there is no persisted record of what the user deliberately
committed to for a given week.**

The code says so itself. `weeklyBusinessReview.ts:163-166`:

> "Only the current promise is stored on an opportunity, so this is honest for
> the live period — past periods cannot be reconstructed and are not pretended."

That is the whole gap. `buildCommitmentLedger` derives promises from
`opportunity.nextActionDate`, which is *current* mutable state. Consequences:

1. Editing a next action rewrites history — last week's plan silently becomes
   this week's plan.
2. "Carried over" cannot be distinguished from "never planned".
3. "Dropped" is unobservable — a deleted next action leaves no trace.
4. "Unplanned but valuable" is unobservable — there is no plan to diff against.
5. Recommendation *acceptance rate* is unmeasurable: nothing records that a
   suggestion was shown and rejected.

So the missing thing is not intelligence. It is a frozen, append-only,
week-scoped record sitting between recommendation and execution.

## 4. Duplication risks

| Risk | Mitigation |
|---|---|
| Second task manager | Commitment items are **outcome statements bound to existing entities** (opportunityId / contextId / quoteId), max 5. No subtasks, no assignees, no due-time, no status board. |
| Duplicating `actionOutcomeStore` | That store answers "did this recommended action help this deal?". The snapshot answers "did I do what I said I'd do this week?". The snapshot **references** action outcomes as evidence; it does not restate them. |
| Duplicating `reviewPacks` | Review Pack = manager-facing pipeline artifact. Snapshot = personal weekly intent. Different audience, different lifecycle. Reuse the *storage pattern*, not the type. |
| Third recommendation engine | Snapshot creation **must** seed from `buildNextWeekPriorities()` output only. No new ranking logic in this phase. |
| Duplicating `pipelineReviewHabit` | Reuse `getCurrentPipelineReviewWeekId()` as the sole week identity. |
| New API function | Vercel Hobby is at the 12-function cap. Storage goes through `cloudJsonCollectionStore` (add `weekly_commitments` to the table union) — **zero new endpoints**. |

## 5. Proposed smallest data contract

```ts
// src/utils/weeklyCommitment.ts
export type CommitmentSource = 'suggested' | 'user-added';
export type CommitmentResolution = 'completed' | 'carried-over' | 'dropped' | 'open';

export type WeeklyCommitmentItem = {
  id: string;
  label: string;              // frozen at confirm time
  detail: string;             // frozen at confirm time
  source: CommitmentSource;
  suggestionId?: string;      // NextWeekPriority.id, if seeded
  suggestionReason?: string;  // why Memoire proposed it — explainability
  editedFromSuggestion: boolean;
  linkedOpportunityId?: string;
  linkedContextId?: string;
  linkedAccountName?: string;
  resolution: CommitmentResolution;   // set at next review, not before
  resolutionNote?: string;
  resolvedAt?: string;
};

export type WeeklyCommitmentSnapshot = {
  id: string;
  weekId: string;                     // getCurrentPipelineReviewWeekId()
  periodStart: string;
  periodEnd: string;
  confirmedAt: string;                // immutable
  items: WeeklyCommitmentItem[];      // max 5
  suggestedButRejected: Array<{ suggestionId: string; label: string }>;
  carriedFromWeekId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
};
```

Invariants (these are what the tests exist to protect):

- `confirmedAt` and every `label`/`detail` are **immutable after confirm**.
  Reconciliation only ever writes `resolution*` fields.
- Exactly one snapshot per `weekId` per workspace. Re-confirming the same week
  is a guarded replace with an explicit user action, not a silent overwrite.
- `suggestedButRejected` is the acceptance-rate denominator. Without it,
  rejection is invisible.
- No inferred completion. `resolution` is user-set or evidence-backed
  (a captured activity / action outcome on the linked entity inside the
  period); never guessed from opportunity stage drift.

## 6. Minimal user flow

Four screens' worth of behaviour, zero new routes — all inside
`SalesReviewsPage` / `WeeklyBusinessReviewPanel`.

1. **Weekly Review, "Next week" section** — already renders
   `nextWeekPriorities`. Add checkboxes + inline edit + "add your own" (max 5).
2. **Confirm the week** — one button. Freezes the snapshot; unchecked
   suggestions land in `suggestedButRejected`.
3. **During the week** — Today / Dashboard shows a compact "Committed this
   week (3/5)" strip reading from the snapshot. Read-only; check-off allowed.
4. **Next Weekly Review** — a "Plan vs actual" block above the new
   suggestions: committed / completed / carried over / dropped / unplanned
   commercial movement (from activities + outcomes not linked to any committed
   item). Carrying an item forward seeds the next snapshot with
   `carriedFromWeekId`.

## 7. Success metrics

Instrument these **with** the feature, not after (new `ProductFunnelEvent`
values in `productAnalytics.ts`):

- `weekly_commitment_confirmed` — did they ever commit?
- `weekly_commitment_edited` — is the suggestion right or merely a starting point?
- `weekly_commitment_resolved` — did they come back?
- `weekly_commitment_reconciliation_viewed` — is plan-vs-actual read?

Derived rates worth watching: suggestion acceptance rate, week-over-week
return rate, completion rate, carry-over rate.

## 8. Stop conditions

Do **not** build planning calibration, personalized prioritization, or any
further weekly intelligence until, across a real cohort over ≥4 weeks:

- ≥50% of active users confirm a week at least twice, **and**
- ≥40% of confirmed weeks get reconciled at the next review.

If users confirm once and never return, the answer is not more intelligence —
the snapshot itself is the wrong shape and should be reconsidered or removed.

## 9. Files likely to be modified

New:
- `src/utils/weeklyCommitment.ts` — types, snapshot build, reconciliation
- `src/services/weeklyCommitmentStore.ts` — persistence via `cloudJsonCollectionStore`
- `test/unit/weeklyCommitment.test.mjs`
- `scripts/verify-weekly-commitment.mjs`

Modified:
- `src/services/cloudJsonCollectionStore.ts` — add `weekly_commitments` to the table union
- `src/features/reviews/WeeklyBusinessReviewPanel.tsx` — selection + confirm + plan-vs-actual
- `src/features/reviews/SalesReviewsPage.tsx` — wiring
- `src/utils/weeklyBusinessReview.ts` — expose `suggestionReason` on `NextWeekPriority`
- `src/features/dashboard/DashboardPage.tsx` (or `BusinessCockpitStrip.tsx`) — committed-this-week strip
- `src/utils/productAnalytics.ts` — 4 events
- `src/services/workspaceData.ts` / `workspaceDataCache.ts` — load path
- `src/utils/sampleData.ts` — a demo snapshot so the loop is visible in demo mode
- `package.json` — register `verify:weekly-commitment` in `check`
- `docs/database/` — a `weekly_commitments` migration matching the JSON-collection pattern

Explicitly **not** touched: `opportunityStore`, `reviewPacks`, `actionOutcomeStore`,
`api/*` (no new endpoints — Hobby cap).

## 10. Test strategy

`test/unit/weeklyCommitment.test.mjs`, plus a `verify:weekly-commitment`
contract script in the existing style:

1. **Immutability** — mutating an opportunity's `nextAction` after confirm does
   not change the snapshot's stored label. This is the core historical-truth test.
2. **Recommendation vs commitment separation** — a snapshot built from 6
   suggestions where 2 are selected and 1 edited yields 3 items (2 + 1 user-added
   flagged `editedFromSuggestion`) and 4 in `suggestedButRejected`.
3. **Dedup / single snapshot per week** — two confirms on the same `weekId`
   replace rather than accumulate; `confirmedAt` of the replacement is new but
   the prior one is not silently lost mid-week without an explicit action.
4. **Reconciliation** — committed/completed/carried/dropped classification from
   a fixed activity + outcome fixture; carried item seeds next week with
   `carriedFromWeekId`.
5. **No inference** — an opportunity that advanced stages with zero captured
   activity does *not* mark its committed item complete.
6. **Unplanned work** — activity with commercial movement not linked to any
   committed item surfaces as unplanned, not as a miss.
7. **Sample/live separation** — demo snapshots carry `isSample` and never merge
   into a live workspace (mirrors `verify:sample-live-separation`).

---

## Verdict

The proposed work closes a real gap rather than duplicating existing behaviour.
The evidence is the code comment at `weeklyBusinessReview.ts:163` — the current
engine is explicit that it cannot reconstruct past periods, and the entire
"deliberate commitment → execution → learning" arm of the stated core loop
depends on being able to.

Scope is one utility, one store, one panel change, and one dashboard strip.
No new routes, no new API functions, no new recommendation engine.
