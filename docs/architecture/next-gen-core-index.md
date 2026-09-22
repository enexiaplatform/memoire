# Next-Gen Core architecture index

**Release boundary:** Memoire Next-Gen Core ends at M11. This index points to the canonical implementation and the existing architecture decisions; it does not introduce another engine.

| Milestone | Canonical source truth | Derived projection | Persistence boundary | Architecture record |
|---|---|---|---|---|
| M2 Condition | `commercial_conditions`; Evidence stays a separate `commercial_evidence` record | Condition epistemics | Kernel codec, browser mirror, owner-scoped cloud table | [M2 Condition](m2-commercial-condition.md) |
| M3 Requirement | `commercial_outcome_requirements` linked to a Condition when applicable | Requirement resolution and next blocking question | Kernel codec and owner-scoped cloud table | [M3 Requirement](m3-outcome-requirements.md) |
| M4 Dependency | `commercial_dependencies` between same-Opportunity Requirements | Known Blockers and Buyer Progress | Kernel codec; Buyer Progress is never stored | [M4 Dependency](m4-commercial-dependency-buyer-progress.md) |
| M5 Time | `commercial_timing_assertions`, Commitment dates and Opportunity target | Last Safe Date, Recovery Window and timing state | Assertions persist; calculated dates do not | [M5 Time](m5-commercial-time.md) |
| M6 Forecast | Existing canonical M2-M5 sources and operator forecast category | `deriveForecastDefensibility` | No Forecast Defensibility table | [M6 Forecast](m6-forecast-defensibility.md) |
| M7 Decision | Immutable `commercial_decisions` and bounded execution links | Decision basis display | Decision and versioned basis snapshot persist; no score or winner | This index plus the Decision migration and domain contract |
| M7.1/M7.2 History | `commercial_state_revisions`, `commercial_history_coverage`, lineage and restore RPC | Cutoff source selection and coverage state | Revision triggers share the canonical PostgreSQL transaction; local restore uses a rollback journal | [Historical integrity](m71-historical-integrity.md), [restore readiness](m72-historical-readiness.md) |
| M8 Time Machine | M7 revision chain at an exact system-time cutoff | Current rules composed over the accepted historical sources | No separate historical projection table | [M8 Time Machine](m8-commercial-time-machine.md) |
| M9 Money | `commercial_money_gates` plus existing Opportunity, Quote and Receivable facts | `deriveMoneyConsequences` | Gate relationship persists; amounts and consequences do not | [M9 Money](m9-money-consequence-propagation.md) |
| M10 Simulation | An immutable in-memory capture of current Opportunity sources and explicit assumptions | `simulateCommercialScenario` | Transient only: no table, backup row, Event or Revision | [M10 Simulation](m10-counterfactual-commercial-simulation.md) |
| M11 Learning | Immutable `commercial_decision_observations` linked to an immutable Decision | Comparable cases and thresholded, exact-horizon descriptive aggregates | Observation persists; match/aggregate output does not | This index plus the Observation migration and domain contract |

The canonical registries are `canonicalContracts` in `src/services/canonicalDurability.ts` for backup/restore and `historicalSources` in `src/services/historicalIntegrity.ts` for revision coverage. The pure derivation entry points are `deriveRequirementReading`, `deriveKnownBlockers`, `deriveCommercialTime`, `deriveForecastDefensibility`, `deriveMoneyConsequences`, `simulateCommercialScenario`, and the M11 case-retrieval functions. Opportunity, Today, Review, Money, Time Machine and What-if views consume these boundaries instead of maintaining parallel rules.

The seven primary product destinations remain Today, Leads, Accounts, Opportunities, Money, Plan and Review. Every M2-M11 capability is contextual to one of those surfaces.

