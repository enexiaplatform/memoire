# M10 Counterfactual Commercial Simulation

## Meaning and boundary

M10 answers what the existing Commercial Kernel would derive if one or more explicit operator assumptions were true. It is a static counterfactual calculation, not a prediction. It does not estimate probability, infer future buyer behavior, rank scenarios, choose an Option, or claim causality.

The current implementation is deliberately transient. Opening “What if…” captures an immutable Opportunity-local source base in memory. Closing the panel discards the base, assumptions, and results. There is no Scenario table, local-storage key, migration, backup format change, restore path, Commercial Event, or State Revision because no canonical fact is written.

## Stable base and staleness

`captureCommercialScenarioBase` deep-copies the current Opportunity, Requirements, Conditions, Evidence, Dependencies, Timing Assertions, Commitments, Money Gates, and Quotes. A deterministic source version and a capture-time base identity identify the exact input. Every calculation uses that copy from start to finish.

The product compares the captured version with the current prepared source. If current records change, an existing result remains tied to the captured base and is labelled stale. The operator can exit and reopen to capture a new base. The engine never mixes a newly loaded entity into an older run.

## Bounded assumptions

M10 v1 supports three explicit assumption types:

- Requirement resolution, optionally effective on a specified date;
- Requirement duration in calendar or business days;
- Opportunity close target date.

Every assumption has a stable identity, an operator label, and a reason. Validation rejects unknown, retired, cross-Opportunity, or cross-scope Requirements; duplicate identities; multiple overrides of the same target; malformed dates; unsupported duration values or units; and evaluation before base capture. A future-effective resolution remains pending until the selected evaluation date.

Dependency changes, money amounts, cash realization, arbitrary JSON patches, Evidence, Commitments, Options, Decisions, Actions, and Plans are outside the v1 assumption vocabulary.

## Projection semantics

`simulateCommercialScenario` is the single pure boundary. It creates an in-memory Opportunity target override, Requirement resolution map, and replacement planning-duration assertions, then calls the existing M3–M9 derivations. The engine receives evaluation date, evaluation instant, and calculation instant explicitly; domain code does not read the clock.

A projected Requirement reading preserves its canonical Condition state and Evidence identifiers. Its separate `projection` field and `REQUIREMENT_PROJECTED_*` reason code state that the resolution came from a Scenario Assumption. Forecast premises therefore use `assumed`, never `supported`, and a defensible or conditional projected forecast is presented as `conditional_under_scenario`.

M4 controls dependency propagation. Resolving the leaf in A → B → C removes C as the leaf blocker and exposes B; it does not resolve B or A. Each downstream resolution requires its own explicit assumption. M5 preserves unknown timing and explicitly identifies planning durations as assumptions. M9 keeps source amount, currency, lifecycle, and realization unchanged while its recorded gating path may change. Buyer progress is reported as unchanged and not projected.

## Results and comparison

The result contains base identity, capture and evaluation times, stale status, normalized assumptions, pending assumptions, the captured and projected derived states, and a deterministic field delta. “Why it changed” names factual changed dimensions. Money wording describes path changes and never says recovered, unlocked, saved, or realized.

The Opportunity panel can compare up to three transient scenarios that share one captured base. Comparison shows assumption count, blockers, next question, target, timing, forecast basis, and money paths. It preserves input order and exposes no score, rank, winner, recommendation, or automatic action.

## Performance and deployment

The test fixture covers 12 Requirements, 12 Conditions, 11 Evidence records, 11 Dependencies, timing assertions, a Money Gate, and three comparisons. The calculation is bounded to one Opportunity and uses the existing deterministic kernels.

M10 adds no database object, so there is no M10 deployment action. The target Supabase state for the underlying M2–M9 canonical infrastructure remains **NOT DEPLOYMENT VERIFIED**. This is still a release gate for cloud production claims.
