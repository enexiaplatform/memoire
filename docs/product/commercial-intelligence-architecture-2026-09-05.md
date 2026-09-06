# Commercial Intelligence Architecture

Date: 2026-09-05
Status: **Phase 0 — analysis and design only. No implementation.**
Scope: how Memoire evolves from *Capture → Store → Detect → Remind* to
*Capture → Understand → Notice → Decide → Act → Learn* without becoming a CRM.

---

## 1. Current-state findings

Everything below was read in the repository or measured against the live
database. Nothing here is inferred from a file that was not opened.

### 1.1 The Commercial Kernel is real, small, and correct

`src/domain/commercialKernel/` is 2,639 lines across six files and it is the
best-designed part of the product:

| File | What it owns |
|---|---|
| `types.ts` | Eight canonical concepts, legal state transitions, legacy stage mapping |
| `commands.ts` | The only write path for kernel records; returns results, never throws |
| `deriveThreads.ts` | `resolveCommercialThreads` — threads derived, never migrated |
| `derivePlanCommitments.ts` | Plan promises merged into the commitment set at read time |
| `policyEngine.ts` | 13 `reasonCode`s, pure, evidence-carrying, non-mutating |
| `forecast.ts` | Evidence-adjusted probability and quarter coverage |

`policyEngine.ts` already enforces the two rules this direction asks for: rules
never mutate, and every `Recommendation` carries `reasonCode`, `reasonText`,
`sourceRecordIds`, `threshold`, `severity`, `recommendedAction`, `calculatedAt`
and `href`. `CommercialRiskPanel.tsx` renders "Why am I seeing this?" over those
fields, and `verify-kernel-surface-wiring.mjs` §5 fails the build if it stops.

**The requested "explainable recommendation" architecture already exists.** The
gap is not explainability. It is ranking, context, and coverage.

### 1.2 The commercial event log is built, indexed, deployed — and empty

`commercial_events` exists in the live database with RLS and four indexes
(`user_occurred`, `user_thread`, `user_account`, `user_type`). `eventStore.ts`
implements an idempotent append with a 2,000-row local cap. Nine call sites in
`commands.ts` write events, and their `structuredPayload` already carries
`{ from, to }` — exactly the shape a delta needs.

Two facts kill the naive plan:

1. **Nothing reads it.** `grep` for `loadEvents` / `loadEventsForWorkspace` /
   `EVENTS_UPDATED_EVENT` outside `eventStore.ts` returns zero hits. It is not in
   `collectionLoaders` in `workspaceData.ts`, so no surface can see it.
2. **It is empty in production.** Measured 2026-09-05:

   | Table | Rows |
   |---|---|
   | `stakeholders` | 1,741 |
   | `accounts` | 1,106 |
   | `plan_items` | 166 |
   | `opportunities` | 130 |
   | `sales_activities` | 100 |
   | `opportunity_outcomes` | 13 |
   | `quotes` | 2 |
   | `commercial_commitments` | **0** |
   | `commercial_threads` | **0** |
   | `commercial_events` | **0** |

Threads and commitments are 100% derived today. The event log has no history at
all, and only fills for kernel commands the operator effectively never reaches.
**Delta Intelligence cannot be built on the event log alone** — on the day it
ships it would report "nothing changed" over a six-month book.

### 1.3 Opportunities and quotes carry no field history

`CrmLiteOpportunity` has `createdAt`/`updatedAt` and nothing else temporal.
`updateOpportunity` (`opportunityStore.ts:223`) is a plain store write: no
command, no event, no before/after capture — even though it receives both the
old record and the new input and could diff them for free.

So "decision date moved from Sep 15 to Sep 30" is **not answerable today**. This
is the one genuine data-model gap in the whole direction.

### 1.4 There are five parallel prioritisation engines feeding Today

`DashboardPage.tsx` calls all of these:

| Engine | File | Lines |
|---|---|---|
| `evaluateCommercialPolicies` | `domain/commercialKernel/policyEngine.ts` | 571 |
| `buildUnifiedTodayCommandCenter` | `utils/todayCommandCenter.ts` | 501 |
| `buildTodayCommandCenter` (legacy) | `utils/salesCommandCenter.ts` | 731 |
| `buildProactiveNudges` | `utils/proactiveNudges.ts` | 1,084 |
| `buildMorningBrief` | `utils/morningBrief.ts` | — |

plus `buildBusinessCockpit`, `generatePipelineOpportunityActions` and
`buildCaptureNudges`. Each has its own priority enum (`Severity`,
`TodayActionUrgency`, `CommandPriority`, `NudgeUrgency`) and its own dedupe.

`proactiveNudges` is better than it looks: it regenerates deterministically and
persists only the operator's *decision* (dismissed / snoozed / done), which is
compatible with "policy reads state, does not write it". But it is still a
fourth vocabulary for the same idea.

**Adding a sixth engine for Next Best Action or the Focus Planner would be the
single worst outcome of this work.**

### 1.5 `src/features/v31/` is a shadow domain model

~4,000 lines on a second type system (`src/types/v31.ts`, snake_case
`Account` / `Opportunity` / `Interaction` / `SalesAction` / `Objection`), fed by
`workspaceAdapter.ts` which down-converts the real workspace into it. On top of
that adapter sit four more engines: `brokenLoops.ts` (risk), `memoryHealth.ts`
(health), `salesPatternDetector.ts` (patterns) and `whatChangedDigest.ts`
(change).

`whatChangedDigest.ts` is the closest existing thing to Delta Intelligence and
it is **not a delta** — it is a recency feed. Its `opportunity_stage_changed`
row fires for any opportunity whose `updated_at` is recent, regardless of
whether the stage changed, and titles it "Opportunity stage updated". That is
the same class of defect as the Review page dating closings from the record's
last edit. The adapter also loses commitments, money state, quote lifecycle and
the event log entirely, so nothing built there can see the commercial spine.

**This is the most attractive wrong place to build Delta Intelligence.**

### 1.6 Capture already has a typed draft and a confirm-before-write panel

`classifySalesActivity(rawNote, date, context) → ClassifiedSalesActivity` is a
deterministic, on-device extractor producing a reviewable draft with
`competitors`, `buyingSignals`, `risks`, `timelineSignals`, `nextActions`,
`activityChannel` and `rawNote`. `captureEntityResolution.ts` resolves entities
against real accounts/opportunities plus learned aliases and corrections.

`DailyCapturePage.tsx:1279` renders "Memoire also spotted in this capture" —
stakeholder, objection and quote-state candidates with Create/Ignore and the
explicit promise *"Nothing changes until you confirm."*

Limits of what exists:

- The draft is **one activity record**, not a fact set. There is no amount, no
  commitment (self or customer), no event/date, no confidence, no provenance
  per field.
- The spotted panel runs **after** the activity is saved, and covers only three
  fixed kinds, each with a bespoke candidate builder.
- Extraction is regex over English-shaped prose.

### 1.7 The learning stack is already substantial — and already sample-gated

| Module | What it measures |
|---|---|
| `operatorProfile.ts` (725) | Cycle, deal size, win rate, touch patterns, week shape, cadence — with `profileMinimums`, `emerging`/`reliable` confidence, and explicit `gaps` |
| `forecastCalibration.ts` | Win rate by evidence category and by probability band; `FORECAST_CALIBRATION_MIN_SAMPLE = 3` |
| `personalSalesLearning.ts` | Recurring loss reasons, win signals, evidence gaps, objection patterns |
| `followUpImpact.ts` | Whether follow-ups revive or protect deals |
| `outcomeScoreboard.ts` | Period outcomes against target |
| `dealQualificationScore.ts` | Weighted MEDDIC out of 32, derived, no override |

`operatorProfile.ts`'s header already states the three rules this direction
asks for (minimum sample, stated sample count, read-only). **The learning loop
is not missing. It is under-fed.**

Production has **22 closed deals total across 4 users** (10 won / 12 lost) and
100 activities over six months. `profileMinimums.winRateReliable` is 12. A 2×2
contingency table for "deals involving both QC and Purchasing before quotation
close more often" has cells of 2–5 across the entire database.

### 1.8 Constraints that are already enforced by contracts

| Constraint | Enforced by |
|---|---|
| No new top-level navigation | `verify-navigation-contract.mjs` — six primary destinations, rail derived from `featureRegistry`, no hard-coded `to="/app/..."` |
| Recommendations stay explainable | `verify-kernel-surface-wiring.mjs` §5 |
| Kernel tables stay relational, not JSON blobs | `verify-commercial-kernel-contract.mjs` §1 |
| Derived models stay linear at scale | `verify-performance-budget.mjs` — 300 deals / 900 activities, per-model ms budgets |
| No invented people, companies or brands | `verify-no-invented-identities.mjs` |
| No AI anywhere | `verify-no-ai-dependency.mjs` — seven sections |

`vercel.json` CSP sets `connect-src 'self' https://*.supabase.co
wss://*.supabase.co https://accounts.google.com/gsi/`. **The browser already
cannot reach an AI or research provider.** Any such call must go through
`/api/*`. `api/` currently holds 10 routes against the Vercel Hobby cap of 12,
so there are two free slots.

---

## 2. Product principles (restated as engineering rules)

1. One vocabulary. A concept the kernel names is not renamed by a feature.
2. Derive before persisting. Persist only what cannot be recomputed — which
   means *history* and *the operator's decisions*, and little else.
3. A claim states its evidence and its sample. No sample, no claim — say what is
   missing instead.
4. Recommendations read; commands write; the operator decides.
5. Extraction proposes; the operator confirms; a command commits.
6. Intelligence is ambient. It appears inside the surface that owns the record.
7. Absence of AI must never be the reason an answer is wrong; presence of AI
   must never be the reason an answer is unverifiable.

---

## 3. Target architecture

Adapted to what exists rather than to the diagram in the brief.

```
                      records (stores)                 commercial_events
              accounts · opportunities · quotes            (append-only,
              activities · stakeholders · objections        idempotent,
              plan_items · outcomes · commitments           from/to payload)
                            │                                    │
                            └──────────────┬─────────────────────┘
                                           ▼
                              domain/commercialKernel
                    resolveCommercialThreads · derivePlanCommitments
                              buildCoverage · scoreDealQualification
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            deriveDelta (NEW)       policyEngine (EXTEND)   learning (EXTEND)
            what changed /          reasonCode +            operatorProfile
            so what / now what      candidate actions       forecastCalibration
                    │                      │                      │
                    └──────────────────────┼──────────────────────┘
                                           ▼
                             rankRecommendations (NEW, in kernel)
                     facts + policy signals + statistical evidence
                                           │
                                           ▼
                             one Recommendation list, ranked,
                              each carrying its own evidence
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
                  Today                Account /              Review
             ("best move")           Opportunity          ("patterns")
                                    ("what changed")
                                           │
                                           ▼
                                   operator decides
                                           │
                                           ▼
                          domain/commercialKernel/commands.ts
                                (the only write path)
```

Capture is a second, parallel inlet into the same command layer:

```
raw text (typed · pasted · later: transcribed)
              │
              ▼
    deterministic extractors  ──(optional, later)──►  AI assist endpoint
    salesActivityClassifier                            api/capture-assist
    captureEntityResolution                            server key only
              │                                              │
              └──────────────────┬───────────────────────────┘
                                 ▼
                      CapturedFact[]  (typed IR, NEW)
              each fact: kind · value · confidence · sourceSpan · origin
                                 ▼
                    operator reviews and confirms
                                 ▼
                  existing commands and stores only
```

**The two hard boundaries:**

- Nothing right of "operator decides" is reachable except through
  `commands.ts` and the existing stores.
- `CapturedFact` is the only type an AI provider may ever produce, and it is
  never persisted as a canonical record without a confirmation.

---

## 4. Reuse map

| Requested capability | Reuse | Do **not** rebuild |
|---|---|---|
| Delta: what changed | `commercial_events` table + `eventStore.ts`; dated records already in `SalesWorkspaceData`; `accountTimeline.ts`; `commercialJourney.ts` | `v31/whatChangedDigest.ts` — recency, not delta, on a lossy adapter |
| Delta: so what | `deriveThreads` (money state, waiting party), `dealQualificationScore`, `objectionLedger`, `forecast.evidenceAdjustedProbability` | A second risk model |
| Delta: now what | `policyEngine` `recommendedAction` | A second action vocabulary |
| Adaptive NBA | `policyEngine.Recommendation` (already carries every explanation field), `useCommercialThreads` (already loads threads + coverage + qualification in one pass) | `salesCommandCenter`, `todayCommandCenter`, `proactiveNudges`, `v31/brokenLoops` as *new* homes |
| Universal capture | `classifySalesActivity`, `captureEntityResolution`, `captureCorrectionMemoryStore`, the "also spotted" confirm panel, `commands.createCommitment` | A second parser; a second review UI |
| Learning loop | `operatorProfile` (+`profileMinimums`, confidence, gaps), `forecastCalibration`, `followUpImpact`, `personalSalesLearning`, `objectionPlaybook` | `v31/salesPatternDetector` |
| Focus planner | `todayCommandCenter`'s merge/`amountBase`/`basis` work, `revenueView`, `buildCoverage` | A sixth Today engine |
| Persistence for anything new | `cloudJsonCollectionStore.ts` (generic JSON collection + paging + delta sync + sample isolation) | A bespoke store |

---

## 5. Proposed domain types

All in `src/domain/commercialKernel/`. No new tables except where stated.

### 5.1 Delta

```ts
export const deltaKinds = [
  'stage_changed', 'money_state_changed', 'decision_date_moved',
  'commitment_made', 'commitment_completed', 'commitment_overdue',
  'commitment_rescheduled', 'objection_raised', 'objection_resolved',
  'stakeholder_added', 'stakeholder_role_confirmed',
  'quote_sent', 'quote_expiring', 'quote_value_changed',
  'evidence_added', 'qualification_changed',
  'silence_started', 'silence_broken',
] as const;

export type CommercialDeltaItem = {
  kind: DeltaKind;
  /** One sentence, in the operator's own record language. */
  statement: string;
  occurredAt: string;
  /** Where the claim comes from, so it can be checked. */
  evidence: { source: 'event' | 'record'; recordIds: string[] };
  /** Only set where a genuine before/after is known. Never inferred. */
  transition?: { from: string; to: string };
  materiality: 'material' | 'context';
};

export type CommercialDelta = {
  subject: { kind: 'account' | 'opportunity' | 'thread'; id: string; name: string };
  since: string;
  /** Whether the window predates the event log. Shown, never hidden. */
  historyComplete: boolean;
  changed: CommercialDeltaItem[];
  /** Derived only from `changed`. Empty when nothing material moved. */
  soWhat: { statement: string; basis: string[] } | null;
  nowWhat: Recommendation | null;
};
```

`nowWhat` is deliberately a `Recommendation`, not a new type. Delta does not
invent advice; it selects the highest-ranked existing recommendation for the
subject and says why the delta raised it.

### 5.2 Ranked recommendation

Extends the existing type rather than replacing it:

```ts
export type RecommendationRanking = {
  score: number;
  /** The four separated layers, each independently inspectable. */
  factors: {
    policy: { severity: Severity; reasonCode: ReasonCode };
    money: { amountBase: number | null; currency: string } | null;
    evidence: { qualification: number | null; coverageGap: number | null } | null;
    /** Only present when the operator's own history clears its sample floor. */
    history: { trait: ProfileTraitId; sample: number; reading: string } | null;
  };
  /** Renders under "Why am I seeing this?". Never generated prose. */
  explanation: string[];
};

export type RankedRecommendation = Recommendation & { ranking: RecommendationRanking };
```

### 5.3 Captured fact (the capture IR)

```ts
export const capturedFactKinds = [
  'account', 'opportunity', 'stakeholder', 'interaction',
  'buying_signal', 'objection', 'amount',
  'commitment_self', 'commitment_customer', 'event_date', 'next_action',
] as const;

export type CapturedFactOrigin = 'rule' | 'entity_resolution' | 'ai_suggested';

export type CapturedFact<K extends CapturedFactKind = CapturedFactKind> = {
  id: string;
  kind: K;
  value: CapturedFactValue[K];
  /** 0–1. `rule` facts are 1 or absent; only uncertain extraction carries less. */
  confidence: number;
  /** The exact substring of the raw input this came from. */
  sourceSpan: { start: number; end: number } | null;
  origin: CapturedFactOrigin;
  /** Set once the operator has accepted, edited or rejected it. */
  decision: 'pending' | 'accepted' | 'edited' | 'rejected';
};

export type CaptureDraft = {
  id: string;
  /** Preserved verbatim, always. */
  rawInput: string;
  inputMode: 'typed' | 'pasted_email' | 'pasted_thread' | 'voice';
  capturedAt: string;
  facts: CapturedFact[];
};
```

`inputMode: 'voice'` exists so transcription later feeds this exact pipeline.
No voice code is written now.

---

## 6. Intelligence boundaries

Four layers, physically separated by module, as the brief requires:

| Layer | Where | May read | May write | Works without AI |
|---|---|---|---|---|
| **A. Deterministic facts** | stores + `deriveThreads` + `derivePlanCommitments` | records | nothing | yes |
| **B. Deterministic policy signals** | `policyEngine.ts` | A | nothing | yes |
| **C. Statistical / personal history** | `operatorProfile`, `forecastCalibration`, `followUpImpact` | A | nothing | yes |
| **D. Optional interpretation** | `api/capture-assist` (deferred) | *only the raw capture text* | nothing | yes — degrades to A |

Rules that must hold at every layer boundary:

- B may not call C. Ranking (a fifth, thin layer) combines B and C; the rules
  themselves stay independent of the operator's history, so a threshold is
  always the same number for the same record.
- C may never produce a sentence without a sample count attached.
- D never sees a workspace. It sees one raw capture string and returns
  `CapturedFact[]`. It cannot read the book, so it cannot leak it.
- Nothing in B, C or D imports `commands.ts`.

---

## 7. Persistence strategy

Persist three things and nothing else.

1. **Field-change events** into the existing `commercial_events` table.
   No new table, no new migration, no schema change. `updateOpportunity` and the
   quote status transitions gain a thin kernel command that diffs old vs new and
   appends `opportunity_stage_changed` / `quote_sent` /
   `quote_validity_extended` with a `{ from, to }` payload — the exact shape
   `advanceMoneyCheckpoint` already writes.

2. **Capture drafts**, only while unresolved. A draft is a `CaptureDraft` in
   `localStorage` under the existing `localWriteGuard` discipline, deleted on
   commit or discard. It is *not* a cloud collection: an unconfirmed extraction
   is not workspace data, and syncing it would put unreviewed machine output in
   the operator's book.

3. **Nothing for delta, nothing for ranking, nothing for learning.** All three
   are pure functions over records. Caching, if ever needed, is a `useMemo`, not
   a table.

**Read-path change required:** the event log is currently written and never
read. It must be **bounded**, because it is the only collection that grows
without bound and the workspace load is already ~3MB.

> **As built (Phase 1, 2026-09-05):** the bounded read is a dedicated loader —
> `loadRecentEvents` in `eventStore.ts`, 90 days and 500 rows — consumed by
> `useCommercialDelta`, rather than a new entry in `collectionLoaders`.
> Two reasons, both found during implementation. First, `recordWorkspaceCensus`
> counts every array in the workspace and `isLocalCopyComplete` gates the
> first-paint fast path on those counts; adding a windowed collection to that
> comparison risks the exact P0 this codebase already suffered — a screen that
> declines to draw, or draws a fragment. Second, `loadForWorkspace` merges a
> whole collection and then offers the cloud whatever it appears to be missing,
> which for a windowed read would re-push every out-of-window local event on
> every load. `kernelRepository.workspaceCollectionForTable` already stated that
> `commercial_events` is not part of the workspace; this follows that decision
> rather than reversing it.

---

## 8. AI boundary

**Recommendation: do not implement an AI provider in Phase 1–4. Design the seam
now; open it only if Phase 3 measurement proves the deterministic parser is the
bottleneck.**

### Where AI would genuinely be better

Only one place: **extraction from messy free text.** `salesActivityClassifier`
is regex over English-shaped prose. It cannot reliably pull five distinct facts
with distinct owners and dates out of the Rohto-style example in the brief, and
the repository history already records it losing accented European names. An
LLM is materially better at exactly this: many facts, one paragraph, uncertain
entities.

A weak second: natural-language routing in Ask, where `detectInsightQuestion`
is a keyword matcher. Not worth a provider on its own.

### Where AI would be worse, and must never be used

Delta detection, ranking, statistics, policy, and every number. These are
either exact or they are wrong, and a model makes them unverifiable. A
correlation stated by a model over 22 closed deals is a fabrication with a
confident tone.

### The cost of opening the boundary (do not underestimate this)

`verify-no-ai-dependency.mjs` does not merely forbid an SDK. It pins the
*public claim* that no AI exists, in four places:

- §4 — `.env.example` may not name an AI key.
- §5 — `DailyCapturePage.tsx` must say *"nothing is sent to an AI service"*.
- §6 — `LegalPage.tsx` must say *"Memoire has no AI provider, no AI API key and
  no AI endpoint"* and *"Nothing you write is sent to a language model"*.
- §7 — a whole-`src` sentence-level sweep failing on any surface that offers an
  AI capability.

Plus `verify-kernel-surface-wiring.mjs` §5 requires
*"No AI service was involved"* in the recommendation explanation.

The privacy policy is indexed and quotable since 2026-08-11. **Turning "no AI
allowed" into "no AI required" is a legal, marketing and contract change before
it is a code change**, and it must be done deliberately and all at once, not as
a side effect of a capture improvement.

Note also: `/api/health` currently reports an AI provider key set on Vercel
despite this contract. That must be removed by the operator before any of this
is revisited, or the first thing a security reviewer finds is a key for a
capability the legal page denies exists.

### If it is ever opened, the shape is fixed

- One route, `api/capture-assist.ts` (2 free slots under the Vercel cap).
- Disabled unless a server env var is set; absent config is not an error state.
- Key server-side only. The CSP already makes browser→provider impossible.
- Input: the raw capture string and nothing else. No account list, no book, no
  workspace. Minimum data by construction, not by policy.
- Output: `CapturedFact[]`, validated against the schema; a response that does
  not parse is discarded and the deterministic result stands.
- Every AI-produced fact carries `origin: 'ai_suggested'`, is visibly marked,
  and starts `decision: 'pending'`.
- No SDK. One `fetch` to one documented endpoint.

---

## 9. UX integration points

No new routes. No new nav items. `verify-navigation-contract.mjs` enforces this
and must not be relaxed.

| Surface | Addition | Owner component |
|---|---|---|
| Today | "Best move" — the top-ranked recommendation with its money and its basis | `DashboardPage` → existing `TodayTopThreeActions` |
| Account | "3 meaningful changes since your last visit" | `AccountsPage` → new `DeltaPanel` beside `ThreadsSection` |
| Opportunity | "1 risk increased" on the deal drawer | `OpportunitiesPage` drawer |
| Thread | Delta line inside the existing card | `ThreadQuickLook.tsx` |
| Capture | "7 commercial facts found" — the review list, **before** save | `DailyCapturePage`, extending the "also spotted" panel |
| Review | "2 patterns learned from your book" | `SalesReviewsPage` → existing `ReviewAnalyticsSection` |
| Ask | `isWhatChangedQuestion` re-routed off `v31/whatChangedDigest` onto `deriveDelta` | `AskMemoirePage` |

Every one of these is a section inside a page that already exists. Net new
routes: zero. Net new nav items: zero.

---

## 10. Verification strategy

### Contracts that will be affected

| Contract | Effect |
|---|---|
| `verify-performance-budget.mjs` | **Must gain budgets** for `deriveDelta` and `rankRecommendations` at 300 deals / 900 activities. Delta is the highest quadratic risk in this work. |
| `verify-kernel-surface-wiring.mjs` | Extend §5 so the ranking explanation is inspectable, not just the reason. |
| `verify-recommendation-dedupe.mjs` | Currently asserts on `buildUnifiedTodayCommandCenter`. Must follow the ranking into the kernel as Today consolidates. |
| `verify-today-command-center.mjs` | Same. |
| `verify-no-ai-dependency.mjs` | Untouched in Phases 1–5. Touched only by a deliberate, separately-approved decision. |
| `verify-commercial-kernel-contract.mjs` | Unchanged — no new kernel table is proposed. |
| `verify-navigation-contract.mjs` | Unchanged, and is the guard that keeps it that way. |
| `verify-no-invented-identities.mjs` | Unchanged in Phases 1–5; blocks Capability 6 outright. |

### New contracts required

- **`verify-delta-intelligence.mjs`**
  - A delta item with a `transition` must have a real before/after from an
    event, never from `updatedAt` recency. *(This is the exact defect in
    `v31/whatChangedDigest`; the contract exists to stop it recurring.)*
  - `historyComplete: false` must be surfaced in the UI when the window
    predates the event log.
  - `soWhat` is null when `changed` holds no `material` item — no narration over
    an empty week.
  - Every `statement` traces to `evidence.recordIds`.

- **`verify-recommendation-ranking.mjs`**
  - Every `RankedRecommendation` exposes all four factor layers.
  - A `history` factor is absent whenever its sample is under the floor.
  - Ranking changes order only; it may not add, drop or reword a recommendation.
  - Money participates in the tie-break. *(Regression guard: Today once ranked
    a 3.6M book alphabetically.)*

- **`verify-capture-facts.mjs`**
  - No canonical record is written from a `CapturedFact` with
    `decision: 'pending'`.
  - Every write goes through a command or store — no direct persistence from the
    capture module.
  - `rawInput` survives commit unmodified.
  - Round-trip: every `CapturedFactKind` has a commit path. *(Guard against the
    known failure where an extracted job title never reached the stakeholder
    record.)*

### Contract-design rules to honour

Two failure modes are already documented in this repository and both apply
directly here:

- A marker must be a **unique call site**, not a substring that a comment or a
  type declaration can satisfy silently.
- A check must not be fed a list built from the thing it validates. Derive the
  expected set from the type union (`deltaKinds`, `capturedFactKinds`), never
  from a second hand-written copy.

### Unit tests

`test/unit/` (103 files, `node --test`) gains: `deriveDelta.test.mjs`,
`recommendationRanking.test.mjs`, `capturedFacts.test.mjs`,
`operatorProfileDimensions.test.mjs`.

---

## 11. Migration strategy

**Derive, never backfill.** Same rule `deriveThreads` already follows.

1. **No data migration.** No table is created, altered or backfilled.
2. **Events start empty and that is stated.** `deriveDelta` reads dated records
   first (activities, quotes, commitments, outcomes, plan items — all
   retroactive) and the event log second (forward-only, richer). Where the
   window predates the log, `historyComplete: false` and the UI says
   *"field-level history starts 5 Sep 2026"*. An honest partial answer beats a
   confident wrong one.
3. **Engine consolidation is subtractive and staged.** `salesCommandCenter` is
   guarded by four contracts; it is extracted lazily, not deleted. Today's
   engines are removed one at a time, each behind a green `npm run check`.
4. **`v31` is frozen, then narrowed.** No new work lands there. `Ask`'s
   what-changed route moves to `deriveDelta` in Phase 1; `brokenLoops` and
   `memoryHealth` follow the ranking consolidation in Phase 5. `localStore.ts`
   stays — it is the demo sandbox and is allowlisted by
   `verify-no-invented-identities`.

---

## 12. Explicit non-goals

- No seventh navigation destination, and no "AI Assistant" page.
- No generic automation or workflow builder.
- No custom objects, custom fields, or a relationship builder.
- No new recommendation engine. Net engine count must **fall**.
- No AI dependency; no AI SDK; no AI required for any answer.
- No machine-learning model, no embeddings, no opaque score.
- No voice recording in this programme.
- No external data platform.
- No backfill migration and no new kernel table.
- No causal language anywhere in the learning output.

---

## 13. Implementation phases

| Phase | Capability | Ship | Why this order |
|---|---|---|---|
| **1** | Delta Intelligence | `deriveDelta.ts`; events into `workspaceData` (bounded); field-change events from `updateOpportunity` and quote transitions; delta on Account, Opportunity, Thread; Ask re-routed | Highest value, and it is the only phase that must start *recording* history — every day of delay is history permanently lost |
| **2** | Adaptive Next Best Action | `rankRecommendations` in the kernel; four factor layers; money in the tie-break; ranking exposed under "Why am I seeing this?" | Delta's "now what" needs a ranked recommendation to point at |
| **3** | Universal Commercial Capture | `CapturedFact` IR; extractors emit facts; review-before-save; commit through commands; measure extraction miss rate | Improves the *input* to Phases 1, 2 and 4. Its measurement is also the only honest input to the AI decision |
| **4** | Commercial Learning Loop | Extend `operatorProfile` with channel, stakeholder-coverage, objection-category and follow-up-latency dimensions; Review's "patterns learned"; feed `history` factor into ranking | Needs Phase 3's better-structured history to have anything new to learn from |
| **5** | Focus Planner | Consolidate Today onto one ranked list; retire engines; "your 3 commercial moves" with money protected | A consolidation, not a feature. Only safe once ranking (Phase 2) is trusted |
| **—** | Smart Attributes | **Deferred** | See §14 |
| **—** | External Signal Lens | **Deferred** | See §14 |
| **—** | AI provider | **Deferred, gated on Phase 3 measurement** | See §8 |

---

## 14. Deferred capabilities, and why

### Smart Attributes — defer

Not required by Capabilities 1–4, and it cuts directly against "record once,
derive the rest". There is also a specific known hazard: this codebase has
already shipped a field-by-field sanitizer that silently dropped a field it did
not know about — the record saved, rendered once, and was gone after reload,
with every check green. A generic attribute bag is that failure class by
design. Revisit only if operators are demonstrably storing structured facts in
free-text notes, and then as a small fixed set with a hard cap — never as a
schema builder.

### External Signal Lens — defer

Blocked by three things simultaneously: `verify-no-invented-identities`
forbids surfacing a company or person the operator did not enter; the CSP
forbids the browser reaching any research provider; and it needs a server
endpoint, a paid data source, provenance storage and a privacy-policy change.
None of Capabilities 1–4 depend on it. Revisit after Phase 4.

---

## 15. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Delta becomes a second timeline — "you had a meeting" reported as a change | High | Materiality is defined as *changing an answer the kernel already gives* (money state, waiting party, commitment set, qualification element, objection status, stage, date, evidence). `soWhat` is null with no material item. Contract-pinned. |
| R2 | A sixth prioritisation engine appears | High | Ranking lands **inside** `policyEngine`, and Phase 5 is measured by engines removed. `verify-recommendation-ranking` asserts ranking changes order only. |
| R3 | Delta is built on `v31/whatChangedDigest` because it is already called "what changed" | High | Named in §1.5 as the wrong place. The contract forbids `updatedAt`-recency claims that assert a transition. |
| R4 | The learning loop states a pattern that 22 closed deals cannot support | High | Sample floors enforced in code, not copy; a failed floor becomes a `gap`, not a hedged sentence. Cross-dimensional claims deferred behind a floor. |
| R5 | Delta goes quadratic — it is a join across every collection per subject | Medium | Budget in `verify-performance-budget.mjs` at 300/900 before the feature is considered done. Index by subject in one pass. |
| R6 | The event log grows unbounded and slows every workspace load | Medium | Bounded rolling window in `collectionLoaders`; local cap already exists at 2,000. |
| R7 | Capture's review step adds friction and captures drop | Medium | Facts are pre-accepted where `origin: 'rule'` and confidence is 1; the review is a confirm, not a form. Measure capture rate before and after. |
| R8 | The no-AI contract is weakened incidentally | High | Phases 1–5 do not touch it. Opening it is a separate decision with legal-page and privacy-policy changes in the same commit. |
| R9 | Delta reports "nothing changed" for months because the log is empty | Medium | Record-derived deltas work retroactively from day one; `historyComplete` is shown, not hidden. |
| R10 | Field-change events are written from the store and bypass the command layer | Medium | The diff lives in a kernel command that `updateOpportunity` calls; the store keeps no event knowledge. |

---

## 16. Acceptance criteria

**Phase 1 — Delta**
- An account with six months of history shows a delta on the day this ships,
  without any backfill.
- Every delta statement names the record it came from and opens it.
- A week with only captured notes and no state change produces zero material
  items and no `soWhat` sentence.
- Changing an opportunity's stage or decision date produces a delta with a real
  `{ from, to }` on the next visit.
- `historyComplete: false` is visible wherever the window predates the log.
- `deriveDelta` is inside a declared budget at 300 deals / 900 activities.

**Phase 2 — Ranking**
- One list, one ordering, one vocabulary on Today.
- "Why am I seeing this?" shows all four factor layers separately.
- A recommendation with money outranks an identical one without it.
- No recommendation is added, dropped or reworded by ranking.

**Phase 3 — Capture**
- The brief's Rohto example yields facts for account, stakeholder, objection,
  amount, customer commitment, self commitment, event date and next action.
- Nothing is written until confirmed; the raw input survives verbatim.
- Every fact kind has a commit path through an existing command or store.
- Extraction miss rate is measured and recorded — the input to the AI decision.

**Phase 4 — Learning**
- Every stated pattern shows its sample count.
- No pattern appears below its floor; the gap is named instead.
- No output contains causal language.
- Review shows patterns learned, or says plainly there is not yet enough history.

**Phase 5 — Focus planner**
- Today calls **fewer** prioritisation engines than it does today.
- The three moves state the money they protect or advance.
- Nothing on Today contradicts anything on Plan, Money or Review.

**Programme-wide**
- `npm run check` green at every phase boundary.
- Six primary destinations unchanged.
- `verify-no-ai-dependency.mjs` unchanged and passing.
- Net lines of prioritisation logic **decrease** by Phase 5.

---

# Phase 2 addendum — Adaptive Next Best Action

Shipped 2026-09-05, immediately after Phase 1. This section records the map of
existing priority systems that Phase 2 was required to produce before writing
code, and the decisions taken on top of it.

## The five prioritisation systems, mapped

| # | Producer | Consumers | Priority vocabulary | Input | Output | Writes? | Status | Contracts |
|---|---|---|---|---|---|---|---|---|
| 1 | `evaluateCommercialPolicies` (`domain/commercialKernel/policyEngine.ts`) | `useCommercialThreads` → `CommercialRiskPanel` (Today, Review), `WeeklyPlanPage`, `DeltaPanel` | `Severity` (critical/high/medium/low) + 13 `ReasonCode` | threads, commitments, opportunities, quotes, coverage | `Recommendation[]` | no | **canonical** | commercial-kernel, kernel-surface §5, delta-intelligence E, recommendation-ranking A/B |
| 2 | `buildUnifiedTodayCommandCenter` (`utils/todayCommandCenter.ts`) | `DashboardPage` — Top 3, commercial-risk items, capture inbox, forecast readiness | `TodayActionUrgency` (Critical/High/Medium/Low) + `TodayActionSource` | briefs, revenue actions, opportunities, activities, stakeholders, objections, accounts, quotes, expenses, outcomes | `TodayCommandAction[]` | no | legacy, live | today-command-center, recommendation-dedupe |
| 3 | `buildTodayCommandCenter` (`utils/salesCommandCenter.ts`) | `DashboardPage` — timeblocks, priority actions, at-risk deals, accounts needing touch | `CommandPriority` (Critical/High/Medium/Low) | opportunities, activities, briefs, revenue actions, operating context | `CommandCenter` | no (reads persisted execution decisions) | legacy | daily-execution-loop, sales-flow-execution, operating-system-execution, daily-commercial-priority |
| 4 | `buildProactiveNudges` (`utils/proactiveNudges.ts`) | `DashboardPage`, `PipelineReviewDefenseBriefPage` | `NudgeUrgency` (critical/high/medium/low) + `NudgeStatus` | opportunities, activities, quotes, objections, stakeholders, accounts, outcomes | `NudgeRecord[]` | regenerates deterministically; persists **only the operator's decision** (dismissed / snoozed / done) to the `nudges` table | legacy, live | proactive-nudges |
| 5 | `buildMorningBrief` (`utils/morningBrief.ts`) | `MorningBriefCard` on Today | none (questions, not priorities) | workspace summary | `MorningBrief` | no | legacy, live | morning-brief |

**The overlap.** All five answer "what should I do" from overlapping inputs, in
four different priority vocabularies, with four separate dedupe implementations.
Nothing reconciles them; Today renders several of them at once.

**Phase 2's job was to make one of them canonical, not to delete the other
four.** `rankRecommendations` is a pure ordering over #1's output. It adds no
sixth vocabulary and no sixth producer, which is the precondition for the Focus
Planner phase being able to collapse #2–#5 into it safely.

## What changed

- **New:** `domain/commercialKernel/rankRecommendations.ts` — ranks
  `Recommendation[]`, returns `RankedRecommendation[]` plus an explicit list of
  what was suppressed and why. Pure, injected clock, no writes.
- **Ordering:** lexicographic over four named dimensions — urgency, unblocking
  power, evidence strength, then value. Not a weighted sum. Value is last on
  purpose, so the largest deal in the book cannot outrank an overdue promise.
- **Suppression:** work on a Won/Lost/On-hold deal, "nothing is scheduled" on a
  deal that has a scheduled promise, and semantically duplicate absence-only
  gaps. Each returns the record that contradicts it rather than vanishing.
- **Wired into:** `CommercialRiskPanel` (Today, Review) and the Phase 1
  `DeltaPanel`'s "now what". No new route, no new component on Today.

## Overlap that remains, for the Focus Planner phase

`todayCommandCenter`, `salesCommandCenter`, `proactiveNudges` and `morningBrief`
are untouched and still render on Today alongside the ranked kernel list. Each
is protected by its own contract, so migration is per-consumer and per-contract
work rather than a deletion. The ranked list is now the thing they can migrate
*to*.

---

# Integrity hardening pass — 2026-09-05

Run between Phase 2 and Phase 3, before Capture starts producing more
structured commercial mutations. No new capability; three integrity boundaries
closed.

## 1. Event reliability

**The same-day collision was real.** The idempotency key was
`opp-change:{id}:{field}:{from}>{to}:{day}`, so a deal moved
Proposal → Negotiation → Proposal → Negotiation in one afternoon recorded the
move forward **once**. The key is now the field plus **the revision the mutation
started from** (`previous.updatedAt`) — an identity the record already carries.
Two genuine A→B moves cannot share it, because the B→A write between them moved
`updatedAt`; a retry of the same logical mutation does share it, because it
starts from the same version. A random id would have solved the first problem by
destroying the second.

**Silent event loss was not real, and needed no queue.** `recordCommercialEvent`
writes to the browser copy synchronously and offers the row to the cloud in the
background. A cloud failure leaves the event in `localStorage`, and
`loadRecentEvents` offers the cloud exactly the in-window events it is missing on
the next read. The record is its own queue entry — the same discipline the
offline capture queue uses. Nothing was added.

Retained limitation, stated rather than engineered around: if the *local* write
fails (quota), the event is lost. `localWriteGuard` reports it, the canonical
save survives, and no retry exists. Building one would mean a second durable
list, which is the thing that goes stale.

## 2. Delta relevance

Phase 2 let any observed change on a deal raise the urgency of every
recommendation on that deal. A price objection opening made "no stage evidence
recorded" more urgent — two true facts with nothing connecting them.

Relevance is now an explicit typed mapping, `RULE_CONCERNS:
Record<ReasonCode, CommercialDimension[]>`. A change presses a recommendation
only when its dimension is one the rule is about. Forgetting a rule is a
compile error; nothing inherits "everything".

Five gates, in order: observed transition → non-neutral direction → inside the
delta window → newest change per record (a resolution supersedes the opening) →
not vetoed by canonical state (an `objection_opened` whose objection is no
longer open presses nothing).

Two entries carry their own reasoning. `OPPORTUNITY_WITHOUT_STAGE_EVIDENCE`
also lists `technical`, because a settled technical objection *is* recorded
evidence for the claimed stage. Nothing lists `stakeholder`, because the policy
engine has no rule about who is on the deal — so a stakeholder change has no
rule to be relevant to.

A commitment additionally takes its concerns from `impactType`: an overdue
purchase order (`revenue`) is a purchasing matter, so an open price objection is
genuinely related to chasing it. With `impactType: none`, no connection is
claimed.

`close_period_changed` is the one cross-cutting kind — it reaches every rule
with a clock on it and none without. Listed, not inferred.

## 3. Explanation relevance

Rationale evidence is gated by the same map. An objection is named only when its
category falls inside the rule's concerns and exactly one such objection exists.
A qualification gap appears only beside a rule about evidence — it used to print
"Still missing: champion" under an overdue purchase order.

`COMMITMENT_WITHOUT_OWNER` also stopped borrowing the promise's due date, the
same defect already fixed for opportunity-scoped rules: a tidying job was
inheriting an overdue date and reading as the most urgent thing on the deal.

## 4. Contradiction precedence

Already correct and now pinned: `findContradiction` runs before
`eligiblePressure`, which runs before `describe`. A contradicted recommendation
cannot survive because an old change made it urgent. The contract asserts the
source order.

## Verification

- `verify-recommendation-ranking.mjs` gains Contracts L (relevance required),
  M (canonical truth beats historical pressure, plus the ordering assertion) and
  N (explanation relevance, plus the two objection classifications staying in
  step).
- `verify-delta-intelligence.mjs` gains Contracts J (retry idempotency and the
  ban on random keys), K (durable retry, and no new machinery) and L (no new
  table).
- `test/unit/eventReliability.test.mjs` is new; ranking tests grew to cover the
  relevance matrix in both directions.
- Eight mutations were run against the contracts; all eight fail correctly. One
  of them — reverting the key at the *call site* rather than in the key function
  — passed the first time and exposed a real gap in the tests, which is why
  there is now a test that exercises `recordOpportunityStateChanges` itself.

---

# Phase 3 — Universal Commercial Capture

Shipped 2026-09-05. One messy note becomes several reviewable proposals; only
the accepted ones reach canonical commands.

## What existed, and what it could not do

`classifySalesActivity` already extracted a great deal: activity type and
channel, account and opportunity names, a contact and their job title,
competitors, buying signals, risks, timeline signals, and multiple dated next
actions. `captureEntityResolution` resolved entities against real records plus
learned aliases. The "also spotted" panel already asked before writing.

Four things it could not do:

1. **No money, no decision timing, no commitment party.** The three most useful
   sentences in a B2B note had nowhere to go.
2. **No uncertainty.** `ClassifiedSalesActivity` is a flat draft — a field is
   present or absent, with no evidence, no certainty and no provenance.
3. **Domain mutation lived in the page.** `createStakeholderFromLastActivity`,
   `createObjectionFromLastActivity` and the quote handler each called a store
   directly from a React component, each with its own idea of "already exists".
4. **Only three derived kinds**, each with a bespoke builder, all post-save.

## The architecture

```
raw note ─► parseCapture ─► ReviewableChangeSet ─► review (accept/edit/ignore)
                                                        │
                                                        ▼
                                            commitCapturedFacts
                                                        │
              ┌──────────────┬──────────────┬───────────┴────┬──────────────┐
              ▼              ▼              ▼                ▼              ▼
       createObjection  createStakeholder  createCommitment  updateOpportunity  savePlanItem
              └──────────────┴──────────────┴────────────────┴──────────────┘
                                     │
                          Commercial Kernel ─► Delta ─► ranked NBA
```

Five fact kinds, each with a canonical destination **that already existed**.
The dispatcher's switch is exhaustive, so a sixth kind is a compile error until
its destination does.

## Uncertainty, stated categorically

`exact` / `inferred` / `ambiguous`. Not a percentage: 0.72 implies a calibration
this parser does not have, and the first time somebody sorts by it the number
starts making decisions it was never entitled to make.

"400,000,000 VND" is exact. "around 400M" is inferred and carries
`approximate: true`. An amount whose currency appears in neither the note nor
the deal is ambiguous, offered in the workspace currency and flagged.

## What it refuses to say

- **Attendance is not authority.** A captured person always lands with
  `stakeholderRole: 'Unknown'`. Contract-pinned.
- **A quantity is not money.** A bare number needs a currency or a magnitude
  plus a money word in the same sentence.
- **A past meeting is not a scheduled event.**
- **An estimate is not a quote.** The value fact writes `estimatedValue` and can
  reach no quote or payment field.
- **An unknown customer is not a new customer.** Only an account already on the
  books can be the target; two equal matches resolve to none.

## Delta and NBA equivalence

The proof this phase exists for: a captured value change routes through
`updateOpportunity`, which emits `opportunity_value_changed {from, to}` exactly
as a manual edit does. Verified end to end in the browser — capture wrote
`300000000 → 450000000` and Delta reported it identically to a typed edit.
Capture writes no events of its own and no recommendations of its own; it
changes canonical state and lets the kernel react.

## Partial failure

The stores are local-first and independent, so seven accepted facts are seven
writes and the fourth can fail while the others land. There is no transaction to
pretend otherwise with. Each fact reports its own outcome, the successful ids are
remembered by the caller, and a retry re-runs only what has not already
succeeded.

## Measurement

`services/captureFactMetrics.ts` counts, on the device: captures, captures with
no facts, facts proposed / accepted / edited / ignored / already-recorded by
kind, unsupported findings, save failures. No note text, no names, no amounts,
no endpoint. The `ProductEvent` union was the obvious home and is the wrong one -
it is mirrored in an API route and a Postgres CHECK constraint, so adding six
names is a migration.

## The AI seam

`CaptureParser` is `(input: CaptureParseInput) => ReviewableChangeSet`. There is
one implementation and it is deterministic. A future optional model would return
the same change set, so the review panel, the dispatcher, the commands and the
kernel are unchanged by where the facts came from. No provider, no endpoint, no
key, no CSP change, and `verify-no-ai-dependency` is untouched.

---

# Phase 3.1 — Commercial Evidence & capture coverage

Phase 3 proved the capture architecture and, in proving it, produced a list of
things the parser could read and had nowhere truthful to put. The largest was a
trial result. For a technical seller that is not a footnote: it is the fact the
whole deal turns on, and a control tower that can hold "they object to the GPT
verification" but not "the trial passed" is describing half a deal.

## Was a new primitive necessary?

Five existing concepts were examined before anything was added.

| Concept | Why it is not the home for this |
| --- | --- |
| `commercial_events` | State-transition history. Every type in it is written by a command as a side effect of a change Memoire itself made, so its truth is guaranteed by construction. A reported trial result is the opposite: nothing in the workspace changed and the claim rests on the seller's word. Events are also never edited and never superseded, and both are needed here. Decisively, the log runs forward only — Phase 0 found it empty for every workspace older than the instrumentation — while a dated record describes a trial that happened last month. |
| `objections` | A blocker the customer raised. Filing a passed trial as a resolved objection asserts an objection that never existed. |
| `sales_activities` | What the seller did. "Met QC" is the meeting; it is not the finding. |
| `opportunities.evidence` | One free-text box, overwritten on every save. It cannot hold a failed trial on the 1st and a passed retest on the 5th, and it cannot say which is current. |
| `knowledge_notes` (Vault) | Durable business knowledge, deliberately outside the workspace load so Today and Accounts do not pay a round trip for it. Evidence is read by the policy engine on every load, and typing the Vault would be the first step towards the knowledge graph this phase is not building. |

So: a new primitive, kept as small as the problem allows.

## The record

`CommercialEvidence` — one closed category (`technical_outcome`), a three-word
direction (`positive` / `negative` / `neutral`), a canonical one-line summary,
the operator's own sentence, an observed day and a recorded instant, and
provenance. It is the fifth Commercial Kernel table.

Two candidate categories were investigated and left out.

**Commercial signals.** "Procurement started" is a stage move and "the decision
slipped" is an expected-close move; both already have canonical homes, and a
second place to say them is how two surfaces come to disagree. The one member
with no home — "budget confirmed" — changes no rule that exists today.

**Competitive context.** The parser recognises it. Recognising is not a reason
to store: no policy rule, no Delta reading and no ranking dimension would behave
differently, so building the store first would be a feature arriving ahead of
the thinking that justifies it. It stays an `unsupported` line.

## Why this is not Smart Attributes

The category set is closed in three places at once: a `const` tuple, an
exhaustive `Record<EvidenceCategory, CommercialDimension>` that makes a new
category a compile error until its relevance is declared, and a Postgres CHECK
constraint. There is no user-defined key, no value type, and no free-form name.
An attribute system is one where the schema is data; here the schema is code,
and the database agrees.

There is also no number. Direction is three words because a confidence score
would be a sentiment reading dressed as a measurement, and the first surface
that sorted by it would be ranking deals on an adjective.

## Supersession

The smallest rule that can be stated in a sentence: within one scope (a deal, or
the customer when the finding names no deal) and one category, the latest
observation is what is true now. Nothing is deleted and nothing is rewritten.

The consequences are split deliberately:

- **Delta lists both.** A trial that failed on the 1st really did fail on the
  1st, and erasing it to keep a summary tidy is rewriting the deal's history.
- **The reading uses only the current one.** Otherwise a fortnight containing a
  failure and its retest reports technical risk as both increased and eased.
- **Ranking ignores the superseded one**, through the same canonical veto that
  already handles an objection resolved inside the window.

## What evidence changes

One policy effect and one ranking effect, both typed.

`OPPORTUNITY_WITHOUT_STAGE_EVIDENCE` fired on a blank free-text box. It now also
asks whether a supporting finding is recorded, because a rule that says "nothing
recorded supports that stage" to a seller who wrote down last week that the
trial passed is a rule they stop reading. Negative evidence deliberately does
not count: the rule asks what *supports* the stage, and a failed trial is the
opposite of support.

In ranking, evidence reaches recommendations only through the Phase 2.1
dimension gate. A `technical_outcome` finding is relevant to rules that declare
`technical` as a concern and to nothing else, so a passed trial cannot make a
quote expiry less urgent — verified both ways in the browser.

## Capture coverage

Four gaps from Phase 3, closed:

1. **Stakeholder cues.** The cue list was written twice — once in the contact
   resolver, once in the capture parser — which is why "had a chat with Nguyen
   Thi Lan" produced neither a contact nor a stakeholder while "met" produced
   both. There is now one exported list and both build their pattern from it.
   The name class also moved from `[A-Z]` to `\p{Lu}`, which had been silently
   refusing every accented first letter.
2. **Subject-less scheduled events.** "Site acceptance test on 14 October"
   needed a capitalised human subject and so produced nothing. It now also
   matches a named kind of business event plus a scheduling preposition plus a
   date the note actually contains — all three, because two of the three turns
   "payment is due on 30 October" into a site visit. A date already past is
   history, not a plan item.
3. **Commitment duplicates.** Capture checked for repeated promises against an
   empty list: the stored ledger has one writer and is empty on almost every
   workspace. It now calls `mergePlanCommitments`, the same derivation Today,
   Plan and the policy engine use.
4. **Money in Delta.** "Deal value moved 300000000 → 450000000" now reads
   "300M VND → 400M VND". The currency travels in the event payload as a raw
   domain value; formatting happens at the derivation boundary, so the stored
   before/after stays comparable and convertible.

---

# Phase 4 — Personal Commercial Learning

The question this phase begins to answer is "what tends to work in *my* book",
not "what are sales best practices". The governing rule is the harder half:
measure before concluding.

## What already measured personal patterns

Five systems existed and none of them was replaced.

| Module | Question it answers | Verdict |
| --- | --- | --- |
| `operatorProfile` | "What is my normal?" — cycle length, deal size, touches behind a win | Left alone. It already carries per-trait minimums, an emerging/reliable ladder, gaps as first-class output, and it already filters activities to before the outcome date. Its floors are now the anchor for this phase's. |
| `personalSalesLearning` | "What do I keep writing down as the reason?" — frequency counts over retro text | Left alone, and deliberately *beside* the new panel rather than merged. It counts what the operator typed; the new engine compares what the records contain. Two different questions. |
| `forecastCalibration` | "Is my declared confidence honest?" | Left alone. Its `FORECAST_CALIBRATION_MIN_SAMPLE = 3` is a single-group win rate, which is a weaker requirement than a two-group comparison and correctly so. |
| `followUpImpact` | "Did my follow-ups bring quiet deals back?" | Left alone. It measures a period, not a cohort. |
| `commercialLearningBrief` | The copyable summary | Left alone; it composes the above. |

Nothing was consolidated, because none of them answers the question this phase
asks. What was reused is the *discipline*: `profileMinimums.touchPatternPerSide`
and `profileMinimums.winRateReliable` are the anchors for the new floors, so the
product now has one defensible family of "enough data" rather than a sixth.

## The pipeline

Closed deals → observability gate per pattern → per-deal observation with
chronology → two groups → effect and strength → `PersonalLearningEvidence`.

Six patterns, all measuring Won versus Lost. That is the only outcome the
repository can support honestly: progression speed would use the deals that have
not closed, which is most of them, but progression needs observed stage
transitions and the event log holds zero rows and only runs forward.

## The three ways to get this wrong

**Treating a gap in the instrument as a fact about the deal.** Every pattern
resolves an `observableFrom` date from the workspace's own records — the first
day the seller ever wrote a record of that kind — and a deal that closed before
it is excluded rather than counted as an absence. Nothing is pinned to a release
date. A record type with no rows makes every deal unobservable, which is the
correct answer rather than a bug. The same rule covers linkage: a deal with no
activity linked to it has an unknown contact history, not an empty one.

**Reading the answer back into the question.** Every observation is gated on
both the business date and the recording date being on or before the outcome. A
stakeholder added while writing the win-up, an objection closed the week after
the loss, a note captured during the retro — all true records, none of them
knowledge anybody had while the deal was live.

**Comparing groups that are not comparable.** Strength is decided by the smaller
group first: twenty-nine against one clears any total floor and is not a
comparison.

## What it does to prioritisation

Nothing. `PersonalEvidence` — the seam Phase 2 left empty — now has a real
consumer, and it produces one extra line in a recommendation's "why this" for a
matured, dimension-relevant pattern. It changes no order, and that is a decision
rather than an oversight: no pattern in this workspace has reached `established`,
a reordering path nothing can exercise ships untested, and ranking is
lexicographic over four checkable dimensions precisely so a seller who disagrees
can see which one decided it.

## What the real workspace says today

All six patterns report `insufficient`. Twelve closed deals are usable at all;
three of the six have never had a record of the kind they need written. That is
the honesty gates working, and it is the result this phase was built to be able
to produce.

---

# Phase 4.1 — Commercial data linkage

Phase 4 ended with six valid learning patterns and nothing to measure. The
constraint was not the intelligence architecture. It was that the history was
not attached to the deals it belonged to: one activity in a hundred carried an
opportunity link, while ninety-nine of the same hundred carried the customer.

## Root cause

`createLocalActivity` and `activityToInsert` both wrote `link_status: 'Unlinked'`
unconditionally. Whatever scope the operator confirmed on screen was discarded
between the confirmation and the row. Attaching a deal was a separate step
afterwards, in a panel headed "choose a safe manual link" — which is CRM
administration, and people correctly decline to do CRM administration.

A post-save repair existed and could not carry the load: it only fired when the
note contained an opportunity name matching exactly one deal, and only twelve
notes in a hundred contained one at all.

## The rule

Link when reasonably known. Not "link at any cost".

A false link is worse than a missing one. A missing link leaves a cohort small;
a false link leaves it wrong, and nothing downstream can tell the difference —
the activity sits on the deal looking exactly like a correct one.

## Four resolutions, two of which preselect

| State | When | Behaviour |
| --- | --- | --- |
| `exact` | Capture opened from a deal, or the note names one | Preselected |
| `strong_match` | Exactly one open deal that already existed that day | Preselected, correctable |
| `multiple_matches` | Several plausible | Nothing chosen; the operator picks |
| `unresolved` | None plausible | Stays with the customer — a real answer |

Never identity evidence: deal value, closeness of close date, most-recently-
edited, alphabetical order, priority rank. Each would produce a confident link
on a note that names no deal, and each is a property of the deal rather than of
the interaction.

Closed deals are offered for selection — post-sale work is real work — and are
never preselected.

## Temporal plausibility

A deal must have existed on the day of the interaction. This is the guard that
matters most for history: an account's only open deal *today* says nothing about
what was open in March, and reading the present back into the past is the
easiest way to manufacture a history that never happened.

## Stakeholder involvement is derived

`StakeholderRecord.opportunityId` is one field, so a person on two deals needs
two records — two Lans, each with half a history. Involvement is therefore read
off opportunity-linked activities that name a person the workspace already
knows: no migration, no duplicate identity, two deals at once, and it improves
automatically as linkage does. It never touches the MEDDIC role.

## What did not change

Learning thresholds, learning patterns, and the direction of the dependency.
Linkage cannot see Commercial Learning, and the suggestion engine cannot see
outcomes — enforced structurally and by contract, because a product that chose
the history which made its own findings look better would be worthless.

---

# Real-use validation baseline (2026-09-06)

Feature development stops after Phase 4.1. What follows is a ruler, not a
feature: one deterministic developer report so the next product decision comes
from evidence rather than intuition.

    npm run report:product-validation -- --export <memoire-export.zip|.json>

The input is the archive the product already produces (Settings > Export &
Delete). Its `localBrowserData` carries every `memoire.*` key including the
capture counters, which are device-local by design and reach no server. Nothing
new is collected, no endpoint is called, nothing is stored.

## Why every ratio has a floor

A rate computed from four observations is not a rate. Each ratio prints "not
enough observation yet (n/floor)" instead of a number it cannot support, because
the point of a baseline is comparison with a later one - and a ruler that
reports noise today reports a false improvement in a month. Raw counts are
always shown; the floor withholds the ratio, not the data.

Floors: 20 captures, 20 scope resolutions, 10 post-4.1 activities.

## Baseline

| | |
| --- | --- |
| Capture counters | none in the cloud copy — device-local, must come from the operator's own export |
| Scope resolutions | 0 (shipped the same day) |
| Activities | 100, of which 99 account-linked, 52 on customers that have a deal, **1** opportunity-linked |
| New-path activities | 0 |
| Commercial evidence | 0 |
| Commercial events | 0 — no observed transition history yet |
| Recommendations | 244 produced, 238 ranked, 6 suppressed, across 144 subjects |
| Learning | 0 / 6 patterns past `insufficient`; 12 closed deals comparable at all |
| Recommendation action tracking | not currently measurable |

## The four review gates

Gates decide when a question is worth *looking at*, never what to build.

- **Optional-LLM capture** — 20+ captures, and one of: edit rate ≥ 40%, ignore
  rate ≥ 30%, or ≥ 0.5 unsupported findings per capture. Deliberately not a
  single "useful capture rate" threshold.
- **Linkage UX** — 20+ scope resolutions and a correction rate ≥ 20%. A high
  correction rate matters more than a high unresolved rate: confidently wrong is
  worse than honestly unresolved.
- **Focus Planner** — never inferable from pipeline data. Reports "needs real
  usage observation" until something measures how Today is used, and this report
  adds no tracking to find out.
- **Commercial Learning** — at least one pattern at `developing`, read from the
  same engine the product uses.

All four are `not yet`. Suggested decision: continue real usage collection.
