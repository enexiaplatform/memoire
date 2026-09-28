# Next-Gen Core release invariants

These statements are the compact correctness boundary for R1.

- Evidence is not a Condition. Evidence can support or challenge the operator's stated Condition; it does not silently replace it.
- A Requirement is not a Dependency. A Requirement says what outcome must be resolved; a Dependency says which Requirement must precede another.
- A Dependency is not duration. Ordering and elapsed time are different facts.
- A Decision is not an Action. A Decision freezes selected intent and its basis; execution links point to later work.
- An Intervention is not an Outcome. M11 records both without causal attribution.
- A Commercial Event is not a State Revision. Events are selective semantic history; Revisions are the required reconstruction chain for covered canonical sources.
- Historical reconstruction is not objective historical truth. It is the state Memoire had accepted at an exact system-time cutoff, derived with current rules.
- Money context is not Money consequence. A recorded amount becomes structurally gated only through an explicit Money Gate, and gated does not mean lost.
- A Simulation assumption is not canonical truth. Scenario output never writes canonical records, Revisions, Events, Buyer Progress or the Decision corpus.
- Observed after is not caused by. Comparable cases are descriptive and always expose their match reasons and horizon.
- A Pattern is not Policy. M11 does not rank outcomes, choose a winner, set a success rate or authorize future decisions.
- Required Revision failure rejects the canonical write. Optional Event failure may produce an accepted write with a visible history warning only where the command contract permits it.
- Decision and Decision Observation payload versions fail closed when unknown. Restore does not cast an unknown version into the current shape.
- Sample data never enters live cloud persistence, live Forecast Defensibility, verified history, Money totals, Scenario bases or the Decision Learning corpus.
- Date-only commercial facts and UTC system timestamps remain distinct. Pure domain derivations receive their clock, cutoff and timezone explicitly.
- User ownership is enforced twice where practical: by owner-scoped application queries and PostgreSQL RLS/RPC validation.
- Browser history compression is a storage representation only. Export and every historical read decode the same complete Revision chain; corruption fails explicitly and never becomes empty history.
