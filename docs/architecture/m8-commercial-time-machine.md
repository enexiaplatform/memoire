# M8 — Commercial Time Machine: As Understood Then

Starting SHA: `915d78c0351ae708d480443768870fa50d0af2ee`. Target Supabase historical migrations are **not deployment verified**. This milestone is development and local verification; live cloud Time Machine is not yet production-ready.

## Meaning and time boundary

“As understood then” means the canonical information Memoire had accepted by an exact **system-time** cutoff. A source with an old business date but a later accepted revision is absent before that revision. Business dates (`observedAt`, `validFrom`, due dates, close target) remain visible as recorded facts but never determine whether the source existed at the cutoff. This view does not claim objective truth or grade decisions made then.

The Opportunity drawer opens in Current mode. “As understood on…” enters a separate read-only drawer within the same Opportunity context. The selector takes local date, time and seconds in the device's commercial timezone, converts to one ISO instant and stores only that cutoff and Opportunity ID in the URL. Reload preserves the view. Invalid/future cutoffs are refused; before `historyGuaranteedFrom` yields `pre_coverage`, never current-state fallback. Return to current removes `asOf`. Sample workspaces explicitly have no verified history fixture.

## Composition contract

`composeCommercialStateAsOf` is the one M8 composition boundary. Its inputs are a verified batch of M7 revisions at cutoff, owner scope, Opportunity ID, exact cutoff, explicit timezone and optional cutoff-safe Decision/Activity inputs. It does not call current commercial stores or `Date.now()`. The loader reads one coverage row, paginated owner revisions accepted by cutoff and scoped Decisions. For guest history it reads local M7 revision storage, selecting only revisions at or before cutoff before validation. Ownership is checked by Supabase RLS and again against selected revision identity/scope. A missing Opportunity within verified coverage is `verified_absent`; a cutoff before coverage, unsupported schema, invalid chain or malformed core state never produces a confident forecast.

The composer runs today's pure M2–M6 rules on historical source rows: Condition epistemics, Requirement resolution, next question, dependency blockers, Commercial Time and Forecast Defensibility. The exact cutoff is `calculatedAt`; its day in the user's timezone is M5's historical `today`. Opportunity stage, close claim and operator forecast category come from the selected Opportunity revision. No derived projection is persisted. `derivedWithCurrentRules=true` explicitly means this is what **current Memoire rules** derive from facts accepted then; it is not a replay of the old app version. M7.1 snapshots lacking `updatedAt` may carry `metadataInferred`; this is validator metadata, never an asserted edit timestamp.

Core projection coverage is `full` only when the covered source chain and scope validate and the domain derivations complete. Buyer Progress is independently `partial`: customer Commitment and buyer-provided Evidence signals are verified, while PO/payment Event-only history and prior versions of edited/deleted Activities remain unavailable. A partial optional projection does not invalidate verified core state. Decision rows finalized after cutoff are hidden; older Decision Basis Snapshots remain frozen and separate from rederived Forecast Defensibility. Execution links added after cutoff are filtered. A Decision link can open the Opportunity at its finalization instant. Commercial Events do not reconstruct canonical state and are not emitted by Time Machine views.

## Read-only and failure behavior

The historical drawer has no write handlers, mutable forms, current Condition/Requirement/Timing loaders, or current badges. Its read-only Forecast section accepts the composed M6 view. On gaps it shows the boundary or affected error instead of displaying current values. The normal Opportunity editor and its write commands are mounted only after returning to Current. Historical presentation allows observation and a route back to current work, never an edit to accepted past revisions.

## Storage, performance and release

M8 adds no canonical table or migration. Existing backup format 10 contains revisions, coverage, lineage and immutable Decision basis, so a restored workspace can use the same composer. In-memory measurement of one Opportunity with 12 Conditions, 12 Evidence, 12 Requirements, 11 Dependencies, two Timing Assertions, three Commitments and two Decisions (53 revisions, 33.1 kB JSON) took about 3.5–6.2 ms including source selection and derivation on this development host. The M7.2 portfolio sample has 300 Opportunities and 11,400 revisions (6.64 MiB JSON). Cloud reads currently page the owner's revision history rather than issuing N+1 entity queries; target network latency and a realistic browser round trip remain release measurements. No index was added without a measured target query plan.

This milestone does not implement historical rule-version replay, Then-vs-Now comparison, Decision Learning, money consequence propagation, simulations, policy evaluation, historical editing, timeline animation, global historical Search or a separate Time Machine app.
