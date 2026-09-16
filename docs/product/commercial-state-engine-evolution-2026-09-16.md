# Commercial State Engine — Architecture Evolution Plan

Date: 2026-09-16. Status: Milestone 0 design decision; future models are proposals, not implemented contracts.

## 1. Context

Memoire owns commercial meaning while preserving its existing production records and experiences. The four planes in the charter are logical boundaries, not a directory migration or an instruction to replace working utilities.

**Reproducible baseline:** `c085313fa5ad1b06ac411096a1827a5591f14d13`, the HEAD observed when this audit began. All current-state statements below refer to that revision unless explicitly marked otherwise. The working tree initially contained unrelated Leads work. Other work committed Leads and further product changes while this audit was running (including revisions `709fed6`, `2fdc797`, and `0b3a3c5`). Those changes were neither implemented nor reverted by M0. Verification therefore uses an isolated archive of the initial revision, plus the five M0 tests. See [verification evidence](../qa/commercial-state-baseline-verification-2026-09-16.md).

This is a repository audit, not a measurement of the deployed database. Table population, deployed migration state, production RLS behavior, and actual learning sample sizes were not queried. Historical production counts in the September 5 design document and code comments are not fresh evidence.

The older [Commercial Intelligence Architecture](commercial-intelligence-architecture-2026-09-05.md) is useful history but no longer describes the implementation: the kernel now contains 15 files, Delta and ranking exist, recent events have consumers, capture has canonical fact dispatch, and Commercial Evidence and Commercial Learning are implemented.

## 2. Current Architecture

The application is React/TypeScript, with per-record services, browser storage, Supabase relational tables and JSON collections. It is **not event-sourced**. Current source records remain authoritative; events supplement their history.

```text
Capture / manual editors / reviewed CSV imports
  | activity save first; proposed facts accepted separately
  v
src/services/*Store.ts                     src/domain/commercialKernel/commands.ts
  | existing entity writers                  | kernel commands and validation
  | opportunity changes emit events          v
  +----------------------------------- services/commercialKernel/*Store.ts
  |                                          |
  +-> local guarded storage <-> cloud --------+
       (several persistence strategies; not one transaction)
                         |
              workspaceData + separate plan/target/money loaders
                         |
        +----------------+---------------------+
        |                                      |
  commercialKernel                       established utils/*
  threads / policies / forecast          qualification / money / learning
  evidence / Delta / ranking             Today composition / analytics
        |                                      |
        +------ hooks and surface adapters ----+
                         |
  Today / Plan / Accounts / Opportunities / Money / Review / Search

Recent events: separate bounded load -> useCommercialDelta -> DeltaPanel
Legacy Search: workspaceAdapter -> v31 types -> deterministic query engines
```

The diagram deliberately has two writer paths and a legacy query path. `commands.ts` is the canonical kernel command boundary, not the exclusive writer for all business data. `opportunityStore.updateOpportunity` invokes `recordOpportunityStateChanges`; quote, receipt and milestone stores do not pass through `advanceMoneyCheckpoint`.

### Kernel inventory: all 15 files inspected

| File in `src/domain/commercialKernel/` | Actual responsibility and boundary |
|---|---|
| `types.ts` | Scope, source metadata, thread/commitment/event/value-outcome types, stage mapping and transition predicates. Existing Account and Opportunity types remain in services. |
| `commands.ts` | Create/link/status/waiting/money thread commands; commitment create/complete/cancel/reschedule; targets, value outcomes, evidence and events. Local writes and asynchronous sync are not atomic. |
| `deriveThreads.ts` | Stored threads take precedence; otherwise derives one per opportunity and activity-only account. Money state uses the furthest-along quote. |
| `derivePlanCommitments.ts` | Projects dated capture actions and Plan records as self commitments; merges without persisting; completed stubs suppress derived promises. |
| `commercialEvidence.ts` | One category, `technical_outcome`; latest observation per scope/category, with historical records retained. |
| `capturedFacts.ts` | Typed proposed/accepted/ignored/already-recorded changes and exact/inferred/ambiguous extraction certainty. |
| `parseCapture.ts` | Deterministic proposal parser, entity resolution, dedupe, unsupported findings. Does not write. |
| `commitCapturedFacts.ts` | Accepted facts dispatch to existing stores/commands, with per-fact success and retry tracking. |
| `resolveCommercialScope.ts` | Explicit origin, named deal, sole plausible open deal, ambiguity or account-only scope; dates constrain the sole-deal fallback. |
| `suggestHistoricalLinks.ts` | Read-only individual link proposals; no automatic historical rewrite. |
| `opportunityChanges.ts` | Stage, close period, material value and won/lost diffs with revision-based idempotency. Not a full change journal. |
| `deriveDelta.ts` | Observed changes from events/history/dated records, separate current policy conditions, dimensions, interpretation and source IDs. |
| `policyEngine.ts` | 13 centrally declared reason codes, thresholds and explainable non-mutating recommendations. |
| `rankRecommendations.ts` | Suppression, dedupe and lexicographic urgency/unblocking/evidence/value/date ordering; explanations and source links. |
| `forecast.ts` | Declared and heuristic evidence-adjusted probabilities, quarterly coverage and qualified/unqualified coverage. |

### Surface ownership and data flow

| Experience | Reads/derives | What it owns or writes |
|---|---|---|
| Today (`DashboardPage.tsx`) | Workspace, revenue actions, live pipeline health, unified command center, nudges, cockpit, morning brief, kernel ranking; Plan/order/receivable picture | Operator execution/nudge decisions; existing quote and opportunity actions. No independent canonical commercial state. |
| Plan (`TimelinePage.tsx`, `WeeklyPlanPage.tsx`) | Upcoming board from Plan, activities and dated opportunity work; merged commitments; weekly commitment snapshot | Manual Plan records, completion/override stubs, reschedules; changes to originating opportunity where appropriate. Customer/internal commitments remain ledger records. |
| Plan History (`SalesActivityCalendarPage.tsx`) | Activity ledger/calendar | Activities and linkage. This is not a complete rendering or replay of `commercial_events`. |
| Accounts (`AccountsPage.tsx`) | Account master plus aliases/merges, activity/opportunity candidates, `buildAccountMemory`, `buildAccountTimeline`, stakeholder/objection/quote context, post-won signals and Delta | Account rows and explicit merge judgments. Derived candidates are not automatically new account truth. |
| Opportunities (`OpportunitiesPage.tsx`) | Stage/status, MEDDIC, qualification, Delta, stakeholders, objections, quote links, outcome learning | Opportunity fields, explicit outcome retrospectives, reviewed CSV import/refresh. Lead is an existing stage and baseline Leads table/filter, not a new entity. |
| Money (`MoneyPage.tsx` and revenue panels) | Revenue/flow, committed order book, milestone state, receivables, costs/margins, targets/coverage | Quote state, manual milestones, receipts/terms, purchase-cost assumptions, supplier promises, targets; accounting is separately gated. |
| Review (`SalesReviewsPage.tsx`) | Weekly business review, commercial brief, period actions, kernel recommendations, learning/readiness, analytics and scoreboard | Weekly commitment confirmation and explicit historical-link decisions; copied briefs are derived artifacts. Retained review-pack/brief stores are compatibility data, not today's truth. |
| Search (`v31/AskMemoirePage.tsx`) | Canonical workspace adapted to v31 plus direct money/journey/follow-up/calibration queries | Query/UI state. Answers do not establish evidence or mutate business records. |

## 3. Current Canonical Vocabulary

| Concept | Classification today | Source or projection |
|---|---|---|
| Account | Source of truth | `accountStore.ts`, `accounts`; names remain important join keys; merges/aliases are explicit judgments. |
| Opportunity | Source of truth | `opportunityStore.ts`, `opportunities`; stage, status, value, next action, forecast and qualification context. |
| Lead | Application view of Opportunity | `stage === 'Lead'`; no independent lead customer table in the baseline business workspace. Early-access marketing leads are a different concern. |
| Activity / capture | Source of truth | `salesActivityStore.ts`, `sales_activities`; raw note, business day, extracted signals, source tags, confirmed links. |
| Stakeholder | Source of truth | `stakeholderStore.ts`; role and stance are operator fields. Derived involvement uses linked touches; attendance does not confer authority. |
| Objection | Source of truth | `objectionStore.ts`; concern, status, proof requested and resolution. Kernel comments calling it context do not remove its actual store. |
| Commercial Thread | Explicit source OR derived projection | `threadStore.ts` plus `resolveCommercialThreads`; `derived-opportunity-*` and `derived-account-*` are not persisted row IDs. |
| Commercial Commitment | Explicit source OR projection | `commitmentStore.ts`; immutable original date, current date, due-date history. `plan:*` commitments derive from Plan/capture. |
| Plan item | Source OR projection/override | `planItemStore.ts`, `weeklyPlan.ts`; manual actions, derived keys, completion/dismissal stubs. It is not merely a visual wrapper. |
| Commercial Event | Historical source record | `eventStore.ts`; application append convention, not database-enforced immutability. |
| Commercial Evidence | Source observation | `evidenceStore.ts`; category/direction, quoted text, observed day and recorded instant. Current evidence is derived. |
| Quote | Source of truth | `quoteStore.ts`, JSON `quotes`; amount, customer decision, PO/delivery/payment state and terms. |
| Order / invoice / money checkpoint | Derived with explicit supporting records | `orderToCash.ts`, `receivables.ts`, milestones/receivable terms; no standalone canonical order/invoice document entity here. |
| Purchase cost | Source of truth | `orderCostStore.ts`, one record per opportunity/order, purchase and pricing assumptions; margin is derived. |
| Commercial target | Source of truth | `targetStore.ts`, `(user_id, period, fiscal_year)`; not an ID-shaped kernel repository table. |
| Opportunity outcome | Source of truth | `opportunityOutcomeStore.ts`: Won/Lost/No decision/Delayed retrospective, dated and snapshotted context. |
| Action outcome | Source of truth | `actionOutcomeStore.ts`; recorded action result, distinct from deal closure. |
| Commercial value outcome | Source of truth | `valueOutcomeStore.ts`; operator assessment of Memoire's contribution, not a generic business Outcome. |
| Recommendation, risk, Delta, qualification, coverage | Derived | Pure kernel/utility functions; saved nudge state is the operator's disposition, not persisted risk truth. |
| v31 Account/Opportunity/Interaction/SalesAction | Compatibility model | `types/v31.ts`, `workspaceAdapter.ts`; keep adapters, do not build new state ownership here. |

Application stage vocabulary is `Lead`, `Discovery`, `Qualification`, `Technical discussion`, `Demo`, `Proposal`, `Negotiation`, `Procurement`, `Won`, `Lost`, `On hold`. Status is independently `Active`, `Won`, `Lost`, `On hold`, reconciled by `reconcileOpportunityOutcome`. Kernel stages normalize to `new/qualified/proposal/negotiation/won/lost/paused/archived`. Preserve these explicit adapters; kernel transition predicates are not universal enforcement on every Opportunity editor.

Account, Opportunity, quote, Plan and sales methodology remain useful application concepts even if a later outcome requirement can refer to more than one commercial objective. Do not replace them with generic Party/Outcome rows.

## 4. Current Persistence Boundaries

`workspaceData.ts` loads 16 collections with per-user/per-collection caching, in-flight deduplication, invalidation stamps and background freshness. A 400 ms first-paint fallback requires the browser census to be complete; a 20 s timeout refuses an incomplete local book. `useWorkspaceRefresh` responds to a late cloud answer. These are browser custom-event subscriptions, not evidence of an application-wide Supabase realtime stream.

Three strategies coexist:

1. Accounts/opportunities/stakeholders/objections prefer cloud reads and fall back locally; ordinary cloud reads are not a complete browser mirror. Activity has explicit pending offline creation and retry handling. Do not generalize that queue to all stores.
2. JSON collections use `cloudJsonCollectionStore.ts`: user ownership, local/cloud union by ID and `updatedAt`, local tie precedence, tombstones, and sending only owed rows. This covers Plan, quotes, outcomes, costs, receipts, milestones and artifacts.
3. Relational kernel codecs use `kernelRepository.ts`: sanitized local-first records, column mapping, local/cloud newest-wins merge, unchanged-write suppression, sample exclusion and asynchronous sync. Kernel deletes lack the JSON tombstone mechanism. Targets have a separate loader/writer.

`commercialEvents` is deliberately **not** one of the 16 workspace collections. `useCommercialDelta` reads `loadRecentEvents`: 90 days / 500 rows; local append retention is 2,000. Plan, targets, order milestones/costs/receivables and supplier commitments are loaded by their own consumers. New entities must explicitly decide collection ownership, cache invalidation and subscriptions.

`localWorkspaceOwner.ts` clears foreign workspace keys before another user reads them. Sample mode suppresses cloud access at callers; JSON sync rejects `source: demo`/`isSample`, kernel sync rejects `isSample`. These mechanisms protect different layers and must remain together.

## 5. Existing Intelligence Architecture

### Prioritization is not fully converged

`useCommercialThreads` merges Plan commitments, resolves threads, builds MEDDIC-based qualification and coverage, evaluates policies, derives personal learning, and ranks recommendations. This is the canonical kernel recommendation seam shared by Today and Review. `useCommercialDelta` adds subject observations before selecting the subject's best move.

Other active engines remain:

| Engine | Current role | Evolution decision |
|---|---|---|
| `todayCommandCenter.buildUnifiedTodayCommandCenter` | Revenue/pipeline/capture/account execution composition | Keep composition, migrate overlapping commercial candidate definitions to kernel incrementally. |
| `proactiveNudges.buildProactiveNudges` | Regenerated alerts plus persisted dismiss/snooze/done state | Preserve operator dispositions; converge overlapping rules and IDs rather than add State Engine alerts beside them. |
| `businessCockpit.buildBusinessCockpit` | Summarizes command-center risks/nudges and money | Keep as presentation projection. |
| `morningBrief.buildMorningBrief` | Narrative from nudges/touches/follow-up; avoids cockpit-claimed items | Keep as composition over shared conclusions. |
| `salesCommandCenter.buildTodayCommandCenter` | Legacy supporting/reference/demo computation | Conditional, not eagerly used for the ordinary Today render. Remove only after remaining consumers move. |
| `generatePipelineOpportunityActions`, `buildCaptureNudges` | Reference dashboard analysis and other execution consumers | Still exist; avoid copying qualification/action rules into new conditions. |

The September 5 claim that all five engines run identically on every Today render is stale. There is still overlap, but the legacy/reference computations are gated. New Next Best Question must be a candidate through existing policy/ranking, not another competing sorter.

### Qualification and epistemic limits

`meddicLite.ts` derives nine fields: metrics, economic buyer, decision criteria/process, pain, implication, champion, paper process and competition. Each carries Strong/Partial/Missing, explanation, gaps and questions. `dealQualificationScore.ts` weights them, gates on champion/economic buyer, uses forecast gate 0.75 and effort gate 0.5, and derives an evidence stage. This already provides requirement-like reasoning and questions; preserve it as a methodology adapter.

Some “evidence” is field presence or keyword matching (`hasStrongSignal`), not a structured supported claim. `supportingEvidenceFor` includes neutral as well as positive findings; that is weaker than proof that a required result holds. Forecast's evidence penalty reads `opportunity.evidence`, while policy's stage-evidence rule also reads Commercial Evidence. Therefore those conclusions can differ without any data corruption. Do not automatically map Strong or nonempty text to FACT.

### Capture and provenance

`DailyCapturePage` classifies locally using entity resolution and correction memory, offers scope choices, saves the activity, then calls `openReviewForCapture -> parseCapture`. `CaptureReviewPanel` allows editing/acceptance; `commitCapturedFacts` writes only accepted facts:

| Fact | Canonical destination |
|---|---|
| Objection | `createObjection`, including `sourceActivityId` |
| Stakeholder | `createStakeholder`, Unknown authority/influence, source sentence in notes |
| Commitment | `createCommitment`, capture source ID, then event |
| Opportunity value | `updateOpportunity`, then material-change instrumentation |
| Scheduled event | `savePlanItem` with a stable capture-derived ID |
| Commercial evidence | `recordCommercialEvidence`, source text/activity, business date, then event |

Raw activity save is independently confirmed and remains useful if no proposed fact is accepted. Extracted dated activity actions can already appear as **derived** Plan/self commitments. They are not newly persisted evidence. Inferred/ambiguous extraction certainty and approximate-value flags do not survive as a universal epistemic dimension in canonical records. Conditions must not be silently created during parsing, scope resolution, viewing a recommendation, or migrating a workspace. Dedupe is currently content/scope-based; evidence dedupe does not include observation date, which can hide a repeated same-word result on a later day.

### Money lifecycle

Quotes hold draft/sent/revised/accepted/rejected/expired, PO pending/received, delivery state and payment state. `moneyFlow.ts`/`commercialFulfillment.ts` derive commercial position. `orderToCash.ts` derives committed orders from won/procurement/high-probability opportunities, linked quotes, manual milestone records and cost terms. This is an operational inclusion heuristic; it does not prove that a PO exists.

Contract/PO, deposit, delivery, invoice and paid are order milestones. Quote evidence and operator ticks support them. Receivable records hold delivery/invoice dates, explicit schedule overrides and actual receipts. `paymentTerms.ts` derives dates only when terms and anchors allow it; `receivables.ts` allocates receipts and derives outstanding/aging, preserving unavailable currency and overpayment. `orderMargin.ts` derives margin from order revenue and stored purchase costs. Supplier commitments represent the outgoing obligation side; expense/P&L accounting remains separately feature-gated.

Commercial value is linked mainly by opportunity ID and quote opportunity linkage; thread money state is a coarse quote-derived or explicitly stored summary. A paid quote can put a thread at `paid` while another quote is still outstanding. Neither that label nor a milestone tick can substitute for receivable balances or prove the entire account is collected. No automatic dependency-to-cash-date propagation exists.

### Review, Search and Learning

Review reads weekly business summaries, period changes/actions, shared risks, outcomes, personal learning and analytics; weekly commitments are explicit saved snapshots. Pipeline Defense routes redirect and old brief/review-pack records remain exportable. They are not live commercial truth. `whatChangedDigest.ts` remains a legacy recency engine, but its false stage-change inference from `updated_at` has already been removed.

Search is deterministic: `AskMemoirePage` routes question patterns through direct insight functions or `adaptWorkspaceToV31`, `answerFromMemory`, broken loops, memory health, patterns and change digest. It supports account/deal context, money/awaiting customer, commitments, follow-up, objections, retention, weekly recap, initiatives, signals, calibration and record finding. Answers have context/missing-context and record/deep-link cards; they do not universally carry the kernel's evidence/history contract. Add future queries as thin consumers of the canonical Condition/Dependency projections, then retire overlapping v31 reasoning gradually.

`domain/commercialLearning` measures six patterns: technical acceptance, stakeholder breadth, customer commitments, quote silence, site visits, and objection resolution before closure. It excludes unobservable/undated/late-recorded history; absence is not universally a negative observation. Floors are 8 total/3 per group, 20/6 and 40/12; meaningful effect is 15 percentage points. `personalEvidenceFor` quotes only sufficiently mature, relevant evidence (developing or above), adds rationale and never changes rank. Operator profile has separate minimum-sample gates; forecast calibration requires three observations per category/band. Legacy personal-sales learning and follow-up impact are descriptive/associative, not causal intervention evaluation. Outcome scoreboard derives from dated outcomes, not a second outcome store.

Existing learning needs better linked, dated source data, not a replacement engine or lower sample floors. Production sufficiency is unmeasured in M0. Missing capability is a recorded intervention/decision/expected-result link, plus complete temporal observation coverage for stronger causal or historical questions.

## 6. Architecture Problems / Risks

| Priority | Evidence-backed finding | Smallest evolution / gate |
|---|---|---|
| BLOCKS NEXT MILESTONE acceptance | Shared checkout changed while verification ran. Fixed checkpoint `0b3a3c5` now passes seven-destination contracts but still fails lint on seven unused bindings in `opportunityStore.ts:359`. | Correct those errors and verify the resulting fixed M1 revision; do not certify a moving tree from baseline results. |
| SHOULD FIX SOON; before new canonical persistence | `buildRestorePlan` ignores `cloudData`; `workspaceRestore.CLOUD_TABLE_BY_KEY` contains JSON tables only. Full cloud export is not full restore. Undo is local only; cloud upserts do not delete rows absent from a backup. | Explicit format-aware table-to-codec restore, per-collection completeness/reporting and cloud replacement/undo semantics. No promise of full recovery until tested. |
| SHOULD FIX SOON | Baseline `opportunityToFormInput` omits `closedOn`; `opportunityToRow` writes missing date as null. It also omits imported optional context; cloud writer handles only a subset. | Field round-trip matrix across editor, capture, Plan and CSV paths. Preserve untouched fields; distinguish patch from replacement. Newer concurrent changes may already address parts; verify rather than duplicate. |
| SHOULD FIX SOON | Event history is selective: value moves below 10%, empty-to-populated fields, many statuses and currency-only edits are absent; exceptions in opportunity instrumentation are swallowed. Quote/receipt/milestone mutations bypass event commands. | Instrument factual revisions where the next temporal use case requires them; keep noise thresholds for display, not future historical truth. |
| SHOULD FIX SOON; before Condition semantics | Latest-per-scope/category folds unrelated trials together; neutral findings satisfy stage-evidence presence; direction is not epistemic status. | Link observations to stable condition identity; preserve old projection for old callers; explicit evidence assessments. |
| SHOULD FIX SOON | `deriveThreads.activitiesForOpportunity` broadly falls back to account touches, while Delta/MEDDIC use stricter opportunity linkage. Account event matching compares name keys with account IDs when payload name is absent. | Reuse explicit identity/linkage adapters; never backfill ambiguous links automatically. |
| SHOULD FIX SOON | `useCommercialDelta` passes subject observations into ranking over workspace recommendations; some ranking suppression/pressure assumes already-scoped changes. | Scope candidates and observations together before expanding reuse; add unrelated-deal regressions. |
| SHOULD FIX SOON | Kernel comments promise append history, but SQL grants UPDATE/DELETE and uses FOR ALL; codecs upsert, evidence can replace an ID. | Versioned corrections and compatible insert/idempotency behavior before enforcing immutability; no blanket revocation that breaks sync. |
| SHOULD FIX SOON | Kernel `writeLocal` ignores the guard result; commands can return success despite a failed durable browser write. Cross-record writes are non-transactional. | Typed durable-write outcomes and retry visibility before new multi-record state commands. |
| SHOULD FIX SOON | `createCommercialThread` does not copy sample scope to its record, and `threadCodec.sanitize` has no sample field; repository sample filtering alone cannot protect this command. | Preserve sample provenance before introducing any new callers that persist threads; test command-to-sync exclusion. Existing derived threads do not require persistence. |
| SAFE TO DEFER with explicit limitation | Event window/cap and oldest-event coverage do not prove complete history; local-only old events can be evicted; recent-only retry excludes old offline events. | Explicit coverage/completeness and archival paging before Time Machine; separate pending history from read retention. |
| SAFE TO DEFER | Kernel thread/commitment references are text, often blank, without domain FKs; physical deletes can leave dangling links and stale-device resurrection. | New references scoped by owner; soft archive/tombstones and unresolved-reference projections; do not retroactively impose invalid FKs. |
| SAFE TO DEFER | Two exported `CommercialScope` names mean different things: authorization scope in `types.ts`, resolved capture target in `resolveCommercialScope.ts`. | Alias at boundaries; rename only when a touched API needs disambiguation. |
| REMOVE EVENTUALLY | v31 shadow reasoning and reference-only command center; retired Pipeline Defense/Review Pack routing and artifact code | Migrate consumers and retain user records/deep links; no M0 deletion. |

These are code findings, not claims of observed production loss. No opportunistic behavior fixes were made. Existing guards/tests passing does not disprove omissions outside their coverage.

## 7. Target Logical Architecture

Keep event intake, canonical state, decision reasoning and experience distinct inside the existing architecture. Source records plus explicit observations/requirements produce deterministic state projections; policy and ranking turn those projections into explainable choices; pages render the result. A proposal is never evidence merely because a parser emitted it. A decision records an operator choice, not a hidden autonomous act.

No new parallel `stateEngine` domain. Extend `commercialKernel`, its codecs and established pure utilities. Migrate only the specific duplicate rule touched by a milestone.

Navigation baseline: `PRIMARY_DESTINATION_IDS = ['today', 'accounts', 'opportunities', 'money', 'timeline', 'review']`. Display rail order is Today, Plan, Accounts, Opportunities, Money, Review. Routes are `/app/today`, `/app/timeline`, `/app/accounts`, `/app/opportunities`, `/app/revenue`, `/app/reviews`. Mobile IDs are `today/timeline/accounts/opportunities` plus More. Global registry actions include capture, search-insights, activity, stakeholders, cost-analysis, business-lens, business-vault and settings; registration does not make each a primary rail destination.

M1 promotion must update registry union/primary list/group, route/lazy entry, nav icon, deep links, mobile More behavior and exact navigation-count contracts in navigation/evidence/learning/linkage. Preserve existing opportunity IDs and stage; migrate the existing Leads view instead of duplicating data. Concurrent work already promotes Leads; this is a baseline checklist for reviewing that work, not authorization to implement it again.

Reuse `PageContainer/PageHeader`, Daylight `Panel`, `MicroLabel`, `MicroPill`, `StatusChip`, `Segmented`, `SegmentMeter`, existing drawers and `DeltaPanel/CommercialRiskPanel` evidence disclosure. Reuse `daylightStyles` pill/tint tokens and theme fonts (Outfit, Inter, JetBrains Mono). Existing monogram/spectrum gradients are part of Daylight, not permission to invent another gradient system. No new primitive is necessary in M0; show epistemic meaning with text and existing tones, never color alone or a synthetic percentage.

## 8. Proposed State Model

| Future concept | Mandatory classification | Smallest implementation direction |
|---|---|---|
| Commercial Condition | A — NEW ENTITY | Stable explicit requirement/proposition identity; current assessment derived from observations and explicit declarations. |
| Commercial Dependency | A — NEW ENTITY | Provenanced commercial prerequisite edge with a closed endpoint vocabulary. |
| Evidence-to-condition assessment | B — EXTENSION | Extend existing evidence with optional condition identity and assessment/revision metadata, not a second evidence store. |
| SUPPORTED/ASSUMED/HYPOTHESIS/UNKNOWN/CONTRADICTED | D — METADATA | Epistemic dimension; projected state with supporting/conflicting IDs. |
| Valid time / recorded time | D — METADATA | Additive temporal dimensions on observations/revisions; do not create a Time entity. |
| Outcome requirements | B — EXTENSION | Explicit requirements scoped to existing opportunity/thread; methodology templates derive defaults. |
| Buyer Progress | C — DERIVED | Required conditions satisfied/unresolved with explanations; not activity volume or a persisted score. |
| Next Best Question | C — DERIVED | Uncertainty-targeted candidate through policy/ranking, built on existing MEDDIC questions. |
| Decision record | A — NEW ENTITY, later | Situation, known/unknown, considered options, choice, reason and expected effect; explicit operator record. |
| Intervention intent | B — EXTENSION, later | Typed intended state change on a decision, linked to existing actions/commitments. Promote to an entity only if independent lifecycle is demonstrated. |
| Consequence Propagation | C — DERIVED | Reachability and affected value, timing only with supported lags/anchors. |
| Commercial Time Machine | C — DERIVED | Bitemporal query over sufficient revisions and coverage; existing-surface interaction is E — UI CONCEPT. |
| Forecast Defensibility | C — DERIVED | Requirement argument alongside statistical forecast, never a replacement probability. |
| Simulation | C — DERIVED | Read-only counterfactual overlay; saving a chosen scenario belongs to a decision. |
| Generic replacement Party/Outcome, task dependency graph, duplicate Evidence/Health stores | F — DO NOT CREATE | Preserve Account/Opportunity/Stakeholder/Thread and existing result records. |

## 9. Condition Design

Neither Delta's policy `conditions` nor MEDDIC field reviews are persisted commercial prerequisites. Evidence supplies observations, objections supply concerns, stakeholders supply participants/roles, commitments supply promises. None alone identifies “QA acceptance of stability documentation is required for this PO.”

Minimal proposed Condition definition: `id`, owner scope, `accountId` with compatible account-name snapshot, optional `opportunityId` and optional **persisted** `threadId`, short proposition, closed `kind`, lifecycle active/retired, optional controller party/person, source metadata, created/recorded time. At least one real commercial subject is required. A derived thread must attach via its opportunity/account, never via a fabricated foreign-key row. No duplicated amount, risk label, probability or current-state string is needed on the definition.

Start with one justified kind (e.g. technical acceptance) and a small structured subject/discriminator so two trials or products are not silently conflated. Conditions explicitly chosen by the operator persist because requiredness cannot be reconstructed from activity. Methodology default requirements can remain code-derived; accepting/customizing one gives it a stable explicit identity. MEDDIC templates map requirements to the existing qualification vocabulary rather than making MEDDIC itself canonical truth.

Extend Commercial Evidence with optional `conditionId`, an assertion about that condition's truth, and explicit supersession/correction metadata. Preserve existing category/direction fields and existing unlinked evidence. Link historical observations only through review; do not infer that all old technical evidence proves every technical requirement. Objection resolution may support a condition only when its specific proof does; stakeholder role presence is a requirement input, not automatic proof of authority. A commitment's completion is proof of the promised action, not necessarily the desired result.

## 10. Epistemic State Design

Separate **satisfaction** (holds / does not hold / undetermined) from **epistemic standing**. A supported failed trial is reliable negative evidence, not an unsupported observation.

* SUPPORTED: the proposition has relevant, active supporting evidence; UI may say “supported” rather than imply absolute certainty.
* ASSUMED: explicit operator declaration used provisionally; record who declared it and why.
* HYPOTHESIS: explicitly testable explanation, not automatically usable as a fulfilled requirement.
* UNKNOWN: usually derived for a required condition with no usable assessment; do not write an empty observation just to represent absence.
* CONTRADICTED: relevant counterevidence or unresolved conflicting assessments. Return supporting and opposing evidence and distinguish disproven proposition from unresolved conflict.

Projection precedence: resolve explicit corrections/supersession; filter scope and both time cutoffs; evaluate support/opposition; expose conflict rather than selecting the latest unrelated claim; fall back to explicit assumption/hypothesis or unknown. Neutral/in-progress evidence leaves acceptance undetermined. Extractor certainty describes reading text, not commercial truth. Existing operator-entered fields stay labeled as such until assessed; never bulk-upgrade them to SUPPORTED.

## 11. Temporal / Bitemporal Strategy

`CommercialEvent.occurredAt/recordedAt` and `CommercialEvidence.observedAt/recordedAt` are valuable foundations, but insufficient for reconstruction. Evidence is day-granularity; historical edits, deletions and selective event capture are not complete versions.

Future query has two independent parameters: business time T and knowledge cutoff K. Consider only observations recorded by K and valid at T, apply only corrections known by K, and preserve original observations. Add optional valid-from/valid-to, explicit supersedes/corrects references and append-only revisions as a concrete use case needs them. System time is the recording instant; it must not be rewritten during import. Date-only facts stay date-only; do not invent hour precision.

| Case | Safe handling |
|---|---|
| Backdated capture / late evidence | Original business date plus actual recording time. A Sep 15 entry about Sep 4 is unavailable to “known on Sep 10.” |
| Superseded evidence | Record a new observation/revision; distinguish a later business result from correcting an earlier wrong record. |
| Opportunity history | Current four-field material events are partial observations. Add full relevant revisions before claiming point-in-time value/stage reconstruction. |
| Commitment reschedule | Preserve `originalDueDate` and each move; existing `changedAt` is recording time, not independently supplied business-valid time. |
| Money history | Quote statuses, receipt deletions and milestone overrides need revisions; an invoice date or current Paid flag is not a historical ledger. |
| Import | Keep source business dates where supplied, actual import/recording time and source batch; unknown source date stays unknown. |
| Legacy record without history | Baseline snapshot is “record observed at import/baseline,” never an invented creation or transition history. |

Return coverage per entity/source/field, loaded-window truncation, missing intervals, and basis. “No change observed in available history” is permitted; “nothing changed” is not. `earliestObservedAt` alone cannot establish instrumentation continuity, and an old backdated event cannot prove earlier knowledge. Time Machine remains partial until these coverage obligations are met.

## 12. Dependency Strategy

Initial stored hard-prerequisite shapes: **Condition -> Condition** and **Condition -> opportunity's named money checkpoint**. Interpret A -> B as “B requires A.” An opportunity outcome target can use an explicit requirement link to the same Condition, without creating a generic Outcome graph entity. Commitment -> Condition is initially an intended intervention/support link, not a hard prerequisite: making or completing a promise does not prove acceptance.

Edge fields: owner, ID, typed endpoint references, relation kind, source/evidence/decision reference, operator rationale, recorded/valid time, retirement metadata. An observed association or soft preference must be separately labeled and excluded from hard blocking and date arithmetic.

M4 starts within one opportunity, allowing explicit account-level prerequisites only where scope and owner match. Defer cross-opportunity edges until demonstrated; never auto-propagate an account requirement to every deal. Check self-links, endpoint ownership/existence and duplicate edges. Reject cycles on insertion with bounded iterative traversal; also detect and surface cycles on import so malformed data cannot hang derivation. Archived endpoints stay explainable but inactive for live recommendations; missing/deleted endpoints are unresolved, never silently satisfied. Use stable opportunity + checkpoint keys for derived money endpoints, not nonexistent order-row FKs.

No unrestricted recursion. Index adjacency once, traverse reachable nodes/edges with explicit limits, and report truncation. Unknown duration remains unknown even on a hard edge. Only explicit contractual or otherwise evidenced duration/anchor permits a latest-safe date or consequence date; distributions and ranges stay labeled, not collapsed into fabricated certainty.

## 13. Future Decision Runtime Boundary

Defer persistence until M7. A decision records the situation and evidence references as known then, unknowns, constraints, considered options, selected intervention, reason and expected result. Existing Plan/actions/commitments implement it; outcome/evidence records describe what followed. Separate association from causal attribution. Version the rule/template used for explanations. Simulations cannot write truth, approve themselves, send communications, or execute actions.

## 14. Compatibility Strategy

Add fields/tables with legacy-safe nullable defaults and explicit adapters. Keep existing source records, stage spellings, IDs, source tags and free text. New projections consume old records conservatively. Missing condition data means unknown/not modeled, not failed. Old evidence remains inspectable, not retroactively assigned to invented conditions. Existing forecast is preserved alongside a separate logical defensibility argument. Sample/demo records stay isolated at every writer, loader and restore path.

## 15. Migration Strategy

Before M2 persists anything, close the recovery and writer/reader coverage gates in section 6. Then add Condition definition and optional evidence association using existing kernel codecs and user-scoped SQL conventions. Update command validation, workspace/secondary loaders, invalidation/events, source metadata, demo generation/clear, export, restore and tests as one deliverable. No automatic historical Condition backfill. Extend closed category CHECK constraints only when the domain vocabulary actually changes.

M4 adds dependency rows with legal-shape validation and owner-scoped endpoint enforcement. M5 introduces required temporal revisions incrementally; it must not relabel the incomplete historical log as complete. Database changes remain separate reviewable migrations, with preflight orphan/cycle reports rather than destructive cleanup.

## 16. Performance Strategy

Retain per-collection caching and bounded recent-event loading; do not add an unbounded history fetch to Today. Derive conditions/evidence with indexed folds; graph reasoning targets O(V + E) per relevant subgraph. Cache only reconstructible projections in memory with correct invalidation, not duplicated persisted truth.

Existing `verify:performance-budget` exercises a 300-deal book and a 1,000-closed-deal learning cohort; `verify:surface-scale` checks growth when 100 deals become 200. Extend those fixtures with dense and sparse conditions, repeated evidence, long chains, cycles and missing endpoints when those types exist. Existing passing timings do not prove an arbitrary future graph is safe.

## 17. Security / RLS Implications

Repository migrations establish owner-scoped composite keys for kernel tables, auth-user cascade deletion, RLS with `auth.uid()` ownership, anonymous revocation and hot-query indexes. Events have unique owner/idempotency key where non-null. Domain links are text fields without cross-table FKs; contrary to migration prose, only ownership FKs are guaranteed there. Existing `touch_updated_at` triggers on older tables are timestamp maintenance, not historical journaling. No kernel append-only enforcement trigger is present in the inspected migrations.

Future Conditions/Dependencies need the same owner boundary plus validation that every referenced endpoint belongs to that owner; an ID existing elsewhere is insufficient. Do not infer team authorization from the current user-only scope. Index owner/scope/condition and owner/prerequisite/dependent lookups. New history policy must accommodate current upsert/idempotency behavior before limiting mutation. Preserve account-deletion requirements and distinguish intentional user deletion from silent historical rewriting. Deployed grants/policies still require database validation in the implementation milestone.

## 18. Import / Export / Restore Implications

`api/export.ts` names all five kernel repository tables plus targets and the business JSON/source tables; paging is stable, targets use fiscal-year/period ordering, and the manifest reports incomplete tables. `ExportTab` combines raw cloud data with local workspace keys. Format 2 accepts older format-1 backups and rejects newer versions. Browser-key restoration preserves arbitrary record fields before store sanitization and drops samples.

Coverage is asymmetric:

| Path | Kernel events/evidence/commitments/threads/value outcomes | Targets |
|---|---|---|
| Cloud export | Included | Included with special ordering |
| Local export | Included if present in browser | Included if present |
| Browser restore plan | Local keys restored; codecs may normalize/drop fields | Local key restored |
| Explicit cloud restore push | Not implemented by restore service | Not implemented by restore service |
| Cloud-only export rows -> restored local records | Not implemented | Not implemented |

CSV imports are reviewed Account/Opportunity/Plan entry paths, not a universal kernel restore. Opportunity refresh uses canonical update instrumentation; founder import has source keys/batches but direct ingestion does not create a complete historical event stream. Do not confuse CSV extraction or imported stage confidence with supported truth.

Known field-loss example: baseline form helper omits `closedOn`, while update codec writes null; current field-coverage verification checks six readers, not this helper. Unknown event types are discarded by the event sanitizer, so rolling back an app against newer event kinds can lose local visibility/history. New format/schema versions must preserve unsupported payloads or explicitly refuse unsafe imports; do not silently accept then erase them. Also review export/restore's broad `memoire.*` key inclusion against device/session/ownership keys before claiming a portable, safe full-workspace restore.

## 19. Testing Strategy

M0 adds five runtime tests in `test/unit/commercialKernelRoundTrip.test.mjs`. Four fixtures traverse actual relational row codecs, JSON serialization, backup parsing, restore planning and sanitization for events/evidence/commitments/threads. They assert against original fixtures so two lossy sanitizers cannot hide the same omission. The fifth preserves late-recorded evidence's separate clocks and excludes sample evidence. These protect existing guarantees, not speculative Condition types and not full cloud restore.

Existing contracts protect: navigation counts/routes/deep links; relational kernel schema/RLS/index presence; command and policy ownership; surface explanation/source wiring; Delta provenance; ranking relevance/suppression; accepted-only Capture; evidence category/codec/export wiring; learning chronology/sample gates; no invented identity; source field coverage; restore consent/sample exclusion; cloud collection/export coverage; storage ownership and failure handling; no AI and scale budgets. Many contracts inspect source strings rather than execute Postgres, so they cannot certify deployed policies or complete recovery.

Future milestones add behavioral tests for unrelated simultaneous findings, support versus neutral/contradiction, method-specific missing requirements, accepted-only creation, field/metadata round trips across every writer, same-owner edges, missing endpoints, cycle rejection, both temporal cutoffs, partial history, and unknown timing. Preserve all existing thresholds unless a separately authorized product change explains the difference.

## 20. Rollback Strategy

M0 changes only this design document, verification evidence and an independent unit-test file. Reverting those files rolls back M0; there is no schema or production behavior to reverse. Do not revert unrelated concurrent work.

Future migrations should be additive and leave old readers operational. Disable new projection consumers first; retain newly recorded data for export and forward repair. A rollback must not run old sanitizers destructively over new variants or delete new observation history. Before any data-writing milestone, test backup/recovery of both old and new representations and document whether old binaries can safely read them.

## 21. Milestone Sequence

1. **M0:** this baseline, evolution decision, tested preservation contracts; stop here.
2. **M1:** first-class Leads by promoting the existing Lead-stage view; preserve Opportunity identity and navigation/deep links. Review the concurrent implementation instead of building it again. Accept only on a fixed revision with its intentional seven-destination contracts and preserved source-field round trips.
3. **M1.1 safety gate (recommended prerequisite to M2):** complete export-to-restore coverage/reporting, preserve Opportunity form metadata, expose durable-write failures, and test owner isolation. This narrow addition is justified by actual persistence gaps, not conceptual cleanup.
4. **M2:** minimal Commercial Condition plus evidence linkage, epistemic distinctions and append-preserving correction contract from first write. No dependency graph yet.
5. **M3:** explicit outcome requirements and Next Best Question using existing qualification/policy/ranking; no new prioritization engine.
6. **M4:** minimal commercial dependencies and Buyer Progress; bounded traversal and legal endpoints.
7. **M5:** time reasoning from supported dates/durations; extend revision and coverage capture for temporal use cases.
8. **M6:** forecast defensibility argument alongside existing forecast.
9. **M7:** decision/intervention records linked to current actions and results.
10. **M8:** Time Machine with honest coverage and two cutoffs.
11. **M9:** money consequence propagation, reusing receivables/terms/cost models and supported timing.
12. **M10:** read-only simulation over the same state/decision projections.

The conceptual order is retained. The only added gate is recovery/write safety before new canonical persistence; temporal metadata begins with new records rather than waiting until M8 to discover it cannot be recovered.

## 22. Explicit Non-Goals

No M0 product redesign, navigation change, Condition/Dependency implementation, migration, scoring/ranking change, new AI dependency, external integration, generic Party/Outcome rewrite, graph editor, SDK/API/agent platform, simulation or live database mutation. No claim that repository migrations equal deployed database state. No certification of unrelated concurrent commits from the baseline test run.

**Readiness:** the fixed six-destination baseline is architecturally suitable for narrow M1 promotion and passes existing checks. A second isolated run at `0b3a3c5f9abc31a19aa6059668ee77df0c1aad98`, including the M0 tests, passes 114 of 115 commands and 1,556 unit tests, but fails lint on seven unused bindings in `opportunityStore.ts:359`. The revised seven-destination navigation contracts pass. Acceptance of this checkpoint is **NO-GO until those lint errors are corrected and the resulting revision is verified**; review the already-present Leads changes rather than implementing them twice. This second run does not replace the baseline semantic audit or certify deployment. M2 persistence is gated on the concrete M1.1 recovery/write-safety work above. This audit authorizes none of those implementations.
