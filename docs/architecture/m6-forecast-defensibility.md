# M6 Forecast Defensibility

Forecast Defensibility is one current-state, deterministic argument over the recorded commercial model. It is separate from Memoire's existing quarterly coverage and weighted pipeline calculations, opportunity probability, operator `forecastEvidenceCategory` (`Defensible`, `Weak but recoverable`, `Hope-based`, `Unsupported`), decision recommendation, and historical forecast/probability calibration. Those fields and calculations are unchanged. M6 introduces no persisted argument, score, probability, migration, or automatic forecast edit.

## Claim and scope

The claim is “this active, non-lead Opportunity is expected to close by `expectedClosePeriod`” only when that field is a strict commercial date. Legacy free-text periods and missing dates create `no_claim`, regardless of the default forecast-evidence label. M6 never interprets the date as a PO target.

Active `required_now` Requirements form the direct recorded premises. Their active hard-dependency ancestors, including explicitly linked `required_later` or `context` Requirements, are included. An unlinked `required_later` Requirement is counted as an unresolved scope question: current data cannot establish whether it precedes the close claim, so the argument is incomplete rather than silently omitted or assigned a stage order. Unlinked context Conditions are not premises. An empty required-now basis is `insufficient_basis`, never positive support. The recorded graph is not assumed exhaustive.

Each premise reuses M3 Requirement resolution: supported, assumed, hypothesis, unknown, or contradicted. A separate `blocked` dimension comes from M4's known unresolved leaf blockers, preserving dependency paths and source IDs without listing every downstream node as an independent blocker. The canonical M3/M4 next-best question is reused for the leaf set. Buyer Progress remains factual context in Opportunity; it does not change the verdict.

M5's temporal projection supplies supported, conditional-on-duration-assumption, incomplete, or unsupported timing. Missing anchor/duration and unsupported business-day arithmetic remain incomplete, not failed. M5 permits one explicit target anchor; if another required-now outcome remains unresolved outside that timed path, the full forecast date stays incomplete. When all modeled premises are resolved, no unresolved prerequisite needs a last-safe-date calculation; timing is `not_needed`. A passed close target on an active Opportunity is separately reported as an elapsed claim, never as proof that the customer will not buy.

## Verdict

Precedence is explicit: no dated claim; insufficient required-now basis; contradicted required premise, known unsupported timing, or elapsed target; missing required knowledge, unscoped later gate, invalid dependency graph, or incomplete timing; explicit assumption/hypothesis; otherwise supported **within the recorded scope**. The corresponding verdicts are `no_claim`, `insufficient_basis`, `not_currently_supported`, `incomplete`, `conditional`, and `defensible`. There is no numeric formula, confidence percentage, weighted label, or inference from low activity.

The projection carries the claim source, premise and Evidence IDs, blocker paths and Dependency IDs, timing sources and dates, next question, structural coverage counts, reason codes, and calculation time. “What would have to be true?” lists unresolved leaf premises, applicable explicit assumptions, unknown later-gate scope, and timing gaps. Identical inputs and explicit time produce identical output. Nothing is written back to Opportunity or Event history when a derived verdict changes.

## Surfaces

Opportunity shows the current argument and expandable source/path detail beside Commercial State and Time. Review derives the same projection through a grouped portfolio adapter, showing dated claims that merit scrutiny separately from existing statistical calibration. Today uses the existing policy/ranking pipeline only when the operator's strongest `Defensible` label disagrees materially with an incomplete or unsupported recorded argument; M5's unsupported-time warning owns that case to avoid duplicates. A category-disagreement warning carries the canonical next-best question and replaces its duplicate Today row. Plan may offer review as a user-chosen action but no premise becomes an automatic task. Existing Search and Money semantics are untouched.

The current argument is **not** a historical snapshot. Delta and calibration cannot infer what the argument was at a prior decision time from present records; that requires later Time Machine work. Local code/test database verification does not verify target Supabase deployment of M2–M5 migrations.
