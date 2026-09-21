# M9 Money Consequence Propagation

## Meaning and boundary

M9 answers which recorded commercial value or cash fact is structurally connected to current commercial state. An amount beside a blocker is context. The stronger statement “this value is waiting on this blocker” requires an active, operator-confirmed Money Gate from a supported canonical money source to an Outcome Requirement. Gated never means lost, probable loss, delayed cash, protected revenue or causal impact.

## Existing money model

Opportunity `estimatedValue` is potential commercial value. A Quote amount is the quoted figure and the same Quote moves through Sent/Revised/Accepted, PO received, Delivered, Payment Due and Paid states; these are lifecycle states of one economic source, not separate amounts. The order book derives committed-order state from Opportunity, Quote and milestones. Receivables derive schedules from Quote terms and record actual receipts, including partial payments, outstanding balance and factual overdue days. Payment received is realized cash. Costs and margin remain separate and are not propagated in M9. The existing workspace FX table is used by existing reports, but M9 aggregation never performs new conversion or live FX.

## Money sources and economic identity

The controlled Gate registry supports `opportunity_value` and `quote_value`. Amount and currency are read live from the referenced canonical record and are never copied into a Gate. Opportunity value remains potential; Quote state determines quoted, ordered, delivered, cash due or cash received semantics. A Quote is one identity across its lifecycle. Opportunity and Quote values on the same Opportunity share an economic identity; if both appear, portfolio aggregation is unavailable rather than summing them. Aggregates require unique economic identities and remain separated by currency.

Receivables enter the projection as existing derived cash facts. Overdue needs no Gate and uses outstanding after receipts. It carries no inferred cause. Paid sources and closed, rejected or expired sources do not remain gated.

## Bounded Money Gate

`commercial_money_gates` connects one controlled money source to one Requirement in the same owner, sample scope and Opportunity. It records a controlled basis kind and an operator explanation, plus active/retired lifecycle and standard provenance. It does not link directly to Conditions, infer from stage or text, or arise from a Decision. One validator is shared by commands, restore and pure projection; Postgres independently checks owner, Opportunity, Requirement, source type and source existence. A partial unique index permits only one active Gate per money source; multiple blockers are represented by the existing Requirement dependency graph.

Money Gate writes use the Commercial Kernel repository. Local canonical state and State Revision commit through the existing rollback journal. Cloud writes run through the existing history activation gate and the database revision trigger, so canonical Gate and Revision share one transaction. Creation and retirement emit selective `money_gate_created` / `money_gate_retired` Events after accepted state; blocker, amount and timing changes emit no Event because they are derived.

## Projection

`deriveMoneyConsequences` is the only M9 rule implementation for current and historical callers. It projects Requirement readings, reuses M4 known-blocker paths rooted at the linked Requirement, reuses M5/M6 timing, and returns source identity, amount, currency, realization state, blockers, paths, timing state, consequence kinds, reason codes, provenance, coverage and calculation time. Multiple blockers remain one consequence row and one amount. Resolving every blocker produces `no_current_blocker`; it never marks money received.

Timing `incomplete` and `unsupported` remain distinct. Forecast disagreement supplies context but never produces an expected loss amount. Decisions and Interventions may receive structural downstream-value context only; they receive no saved, recovered or caused amount. M9 does not change recommendation rank or create Actions.

## Product surfaces

Qualified Opportunity shows potential or quoted value, context-only blockers when no Gate exists, an explicit “This value depends on…” confirmation flow, blocker paths and timing status. Money shows explicitly gated value rows and conservative same-currency totals. Today and Review use the same projection to append downstream-value context to existing Requirement/timing recommendations without creating a money priority engine. Existing Collections remains the authority for outstanding, partial payment and overdue cash. Plan is unchanged.

## History and coverage

Money Gates join the M7.1 historical source registry from creation. M8 reconstructs Opportunity value, Gates, Requirements, Dependencies and Timing at the cutoff, then applies current M9 rules. Opportunity-value consequences are cutoff-safe. Quotes and Receivables are mutable JSON sources without State Revision coverage, so historical Money coverage is explicitly partial and those sources are omitted rather than reconstructed from current state. Business dates cannot move late-recorded money backward through a system-time cutoff. Historical language says recorded value and waiting on then, never past money at risk.

## Persistence, security and restore

M9 persists only the irreducible relationship. It adds no consequence, exposure, loss, risk score or second ledger. RLS is owner-scoped. Database triggers reject unsupported polymorphic types, missing sources, cross-Opportunity Requirements, rewritten provenance and resurrection of retired Gates. Backup format 10 discovers the new canonical Kernel store through the shared durability registry; restore runs the shared endpoint validator and preserves Gate revisions, coverage and lineage.

## Performance and deployment

The projection groups Requirement, Dependency, Timing and Commitment rows by Opportunity and produces one row per source, not per blocker. A development-host fixture with 300 Opportunities, 900 Requirements, 300 Dependencies and 300 Gates produced 300 consequences from a 556,353-byte payload in about 11 ms; one Opportunity took about 0.1 ms and an M8 historical composition about 15 ms. Current workspace loading adds one paged Gate collection, not one query per money row. Indexes cover owner/Opportunity/lifecycle, active Requirement lookup and duplicate active sources.

Code and local/test database behavior are verified separately from deployment. Target Supabase M2–M9 remains **NOT DEPLOYMENT VERIFIED**, which blocks production release but not M10 development.

## Explicit exclusions

M9 does not implement probability, expected loss, causal attribution, Decision effectiveness, Intervention ROI, margin propagation, arbitrary cash-date propagation, live FX, a generic value graph, automatic task creation, policy, incidents, simulation, AI or agents.
