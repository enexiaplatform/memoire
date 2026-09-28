# Money Gate recovery and retirement

Starting SHA: `6dea56d707efbfb0123d28937e963ef22da082c2`.

The pre-M12 persistence audit reproduced two failures: retiring an existing Money Gate after its Opportunity closes was rejected by creation-only eligibility checks, and an empty-account restore could not insert a Quote-linked Gate because the required Quote was restored after the historical transaction.

The additive migration keeps endpoint ownership and Opportunity scope validation on every write. Eligibility (active Opportunity value, issued and unpaid Quote, active Requirement) remains required when creating a new Gate. Existing Gates can be retired after their source changes. Verified restoration can replay the original structural relation without inventing new commercial meaning or reactivating a retired Requirement. The restore-context predicate reads a private transaction marker; ordinary clients cannot create the marker.

The existing history restore RPC now accepts only Quote parents referenced by the incoming Gate set. The client includes those parents in the same transaction. Missing parents fail without partial state, mismatched owners/scopes and duplicate parents are rejected, and a divergent current Quote is preserved rather than overwritten. Quote snapshots remain current recovery data; this does not claim historical Quote coverage. No new canonical entity or navigation is added.

The full-chain database tests cover closed-source retirement, paid-Quote recovery, unchanged Revision counts, retries, missing-parent rollback, retained retired Requirements, creation eligibility, restore-context access denial, divergence and ownership. Service tests verify bounded parent inclusion and refusal before the RPC when a Quote is missing. Backup validation retains existing relations to retired Requirements while the new-Gate command enforces current eligibility.

Production application remains pending the P1 gate. This prerequisite repair does not complete M12.

Verification: `npm run check` passed with 1,849 tests, zero failures, build, lint, API typecheck and all repository contracts. Both `verify-next-gen-browser.mjs` and `verify-time-machine-browser.mjs` passed. GO for continued local roadmap development from this repaired baseline.
