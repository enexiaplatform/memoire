# Shared workspaces and authority

A shared workspace is an owner-controlled selection of existing promises plus explicit invitations to authenticated actors. It does not turn an owner's entire personal workspace into a shared database. Existing Opportunity, Evidence, Commitment and Event owner RLS remains unchanged. Bounded server views disclose selected promise text, responsible-person label, due date, status and update time. Private source details, completion evidence, unselected promises and the owner's other commercial records are excluded.

## Ownership and roles

`commercial_workspaces` is a versioned canonical sharing configuration owned by its original `user_id`. The owner chooses a name, up to 20 actor references and up to 50 promise IDs. Each reference must identify a promise owned by the same account. The immutable owner controls configuration, membership, selected records and retirement. No implicit owner transfer, organization administrator power or employee monitoring is introduced.

An invited actor must explicitly accept through their own authenticated account before shared reads are allowed. `reader` permits the bounded shared view; `reviewer` additionally permits review notes. A review is an actor-attributed Event, not accepted Evidence, a Decision, completion proof or a mutation of the owner's promise. The owner remains responsible for any consequent commercial action through existing commands.

Invitations use account references that people exchange themselves. Memoire does not enumerate users, send invitation email or claim recipient consent from a name entered by the owner. Invitations can be declined, including after prior acceptance. Membership/role changes and workspace retirement invalidate prior acceptance. Reopening a retired workspace requires fresh acceptance. The current view exposes at most 50 invitations and 50 reviews per access cycle; it does not claim an exhaustive organization directory.

## Authority and restore

The database generates a runtime `access_epoch` on workspace creation, membership/lifecycle changes and actual historical restore. Clients cannot choose or restore that token. A member response refers to the current epoch; the permission predicate requires both the current invitation and the actor's latest acceptance for that exact epoch. A copied old acceptance therefore cannot reactivate restored or revoked access.

The epoch is operational authorization state and is excluded from canonical workspace Revisions and local codecs. Backup format 15 preserves the owner's configuration, complete original State Revision lineage and actor-owned immutable response/review Events. A recovered configuration receives a new epoch and requires fresh member acceptance. A no-op restore of an unchanged live lineage leaves current access unchanged; divergent live history is still refused by the existing restore gate. Historical actor Events may remain in their own export without granting current access.

Workspace configuration uses the existing required-history/versioned repository, durable local writes, owner/sample isolation, canonical export registry and transactional historical restore. Failed required history prevents a configuration from landing. The migration preserves older source snapshots including `updated_at` and normalizes away only workspace `access_epoch` when comparing restored sources to Revisions. Historical workspace configuration is audit data, not a way to bypass current permissions.

## Data access and UX

Only owners directly read/write workspace table rows. Narrow security-definer RPCs list the caller's invitations, read the selected live view, and record the caller's response/review. These functions bind the actor to `auth.uid()`, validate the current invitation/role, retain idempotent request IDs and lock the workspace while accepting a response. Anonymous calls are denied. Original private-table RLS is not expanded for members.

Review contains a folded Shared workspaces panel alongside recorded team coordination. The owner previews exact people, roles and promise selection and confirms before saving. Local and sample configurations do not grant remote access. The UI explicitly says access changes take effect after account synchronization and provides an account refresh. Member views stay in transient component state and clear on refresh, decline, failed review or scope change. A previously viewed or copied reading cannot be remotely erased; revocation denies subsequent server reads/writes. The UI labels the view as current at its last refresh.

A member cannot edit another owner's canonical promise. Shared ownership transfer, broad administrator roles, organization identity verification, email invitations, generalized access to every Kernel entity and offline access to another owner's private data are non-goals of this minimum permission milestone. Deployment and live-account verification remain pending under P1; development verification uses authenticated fixture identities against the actual migrated permission functions.
