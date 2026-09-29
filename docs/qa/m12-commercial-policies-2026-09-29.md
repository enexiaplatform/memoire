# M12 — explicit commercial policy

Starting green SHA: `d24e8d1a39bb5d033498990633975bef14314bec`.

## Audit and boundary

The existing `policyEngine.ts` produces advisory recommendations from commercial signals. It does not represent human-published rules. M12 adds a bounded canonical Policy aggregate inside the Commercial Kernel and reuses `projectOutcomeRequirements` for meaning. M11 observations and patterns have no publication path into Policies.

One rule belongs to one owned Opportunity and requires an existing Requirement. It applies throughout that Opportunity or when its recorded value strictly exceeds a stated amount in the exact stated currency. This supports rules such as requiring a finance-review outcome above a threshold. Approval or payment-exception outcomes can be represented by existing Requirements and their evidence. A missing value, currency mismatch, missing source, or simulated resolution cannot satisfy the rule.

The current Quote model has no `Commit` status, so M12 does not invent that state. These are explicit, executable review predicates; they do not themselves approve an exception, execute a commercial action, or prevent users from recording a Decision about how to resolve a breach. API command enforcement and shared organizational authority belong to the later governed-command and permission boundaries. The interface makes that review boundary explicit.

## Persisted and derived

`commercial_policies` persists identity, owner, Opportunity, Requirement, applicability, threshold/currency, title, human rationale, consecutive publication version, lifecycle and timestamps. Publication and revision require explicit human confirmation in the command and interface. The authenticated owner is the publisher in the current personal-workspace model.

The existing canonical Revision chain retains earlier versions. Current checks (`satisfied`, `breached`, `unknown`, `not_applicable`), reasons and source references are derived. They are neither scores nor persisted approval flags. Rule retirement is another published version; hard deletion is not granted to clients. No new top-level destination or recommendation engine is introduced.

## Durability, history and ownership

Browser state and its required Revision use the existing rollback journal. The strict policy loader reports unreadable or duplicate data instead of treating it as an empty rule set. Offline versions synchronize consecutively through the Kernel repository. A same-version conflict is surfaced. A newer account version replaces a local copy only if account history contains that exact earlier local version, preserving divergent human edits for reconciliation. A refresh cannot overwrite an edit made while it was loading.

The additive migration enables owner RLS, validates same-Opportunity Requirement scope, immutable identity and consecutive versions, and captures required Revisions. Canonical export, sample exclusion, reference validation and the existing transactional history restore include Policies. Backup format 12 requires the policy source set; older formats remain accepted without inventing prior policy history. The legacy lineage hash excludes the newly added empty source so pre-M12 recovery retries remain idempotent. Policies are restored after their Requirements. No separate history or event system is created.

## UX

Opportunity details has one contextual Commercial policies section. A human selects the required outcome, scope condition and rationale, confirms, then publishes. A revision has a new version number and rationale. Checks explain their exact evidence and show unavailable information honestly. Time Machine derives checks exclusively from the rule and Requirement state selected at its cutoff; it has no policy mutation controls.

## Validation and release status

Unit and durability tests cover confirmation, ownership, stale publication, threshold boundaries, currency gaps, supported/conflicting evidence, simulation isolation, corrupt storage, required-history rollback, offline sequencing, cloud conflicts, sample isolation, backup anchors and future-free reconstruction. Full-chain PostgreSQL tests cover fresh schema, upgrade, legacy lineage, version constraints, Revision rollback, two-owner RLS, anonymous/deletion denial and format-12 restoration of current and historical versions. The browser test publishes, revises, reloads and reads an older version at its exact cutoff, including a narrow viewport.

Production deployment remains **PENDING** under the P1 recovery/access and shared-schema reconciliation gate. Local checks do not verify production. M12 is bounded to individual Opportunity rules; workspace-wide organizational administration and command authority are later roadmap work. No observed pattern becomes policy, no action is executed automatically, and no financial consequence is inferred from a policy breach.

Final verification: `npm run check` passed with **1,866 tests**, zero failures, build, API typecheck, lint and all repository contracts. `verify-commercial-policies-browser.mjs`, `verify-next-gen-browser.mjs` and `verify-time-machine-browser.mjs` all passed against the local app. **GO for M13** from the commit containing this report.
