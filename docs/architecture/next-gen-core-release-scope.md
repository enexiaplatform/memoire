# Next-Gen Core release scope

**NEXT-GEN CORE RELEASE ENDS AT M11.**

R1 freezes the implemented vocabulary and behavior for Condition, Requirement, Dependency, Commercial Time, Forecast Defensibility, Decision Runtime, Historical Integrity, Time Machine, Money Consequence, Counterfactual Simulation and Decision Learning. Work in this gate is limited to correctness, security, migration reproducibility, test coverage, performance evidence, product coherence and release operations.

The following are future generations and are not missing R1 functionality:

- M12 Policy as Code
- M13 Commercial Incidents
- M14 Attention Budget
- M15 Contract Runtime
- M16 Manager and Team workflows
- M17+ platform, API, SDK, agents, connectors and cross-company protocol

R1 adds no top-level product destination and no new scoring, AI intelligence or generic value graph. Existing older modules whose filenames use words such as “policy” retain their pre-R1 recommendation contracts; they are not an M12 implementation and are outside this consolidation unless they violate an R1 invariant.

The release label is **NEXT-GEN CORE RELEASE CANDIDATE** until the target Supabase migration chain and live smoke matrix are verified. Production deployment is a separate, explicit gate.

