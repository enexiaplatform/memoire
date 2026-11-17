# Implementation changelog

## 2026-11-17

- Established the architecture and workflow baseline at `4a5f55e` with a full local regression run. Rebased on `7b8eb1c`, which already shipped native workspace creation, selective copy and routing.
- Added owner-generation guards for delayed collection merges, offline fallbacks and reporting preferences. Invalidated aggregate and collection caches and remounted protected content on account changes.
- Reused the deployed workspace-link validation from the native workspace migrations. This release candidate adds no database migrations.
- Added a workspace copy summary and explicit confirmation. Contacts select their required Accounts and changes to the destination or selection require fresh confirmation.
- Integrated the ten local Capture and Plan changes in the release worktree. The original checkout still holds those edits. Completing a task can link an existing Activity or write a new Activity with a stable task-based ID. Reopening retains the Activity association.
- Reused the first Activity ID when a cloud save loses its response and retries through the offline queue. Reject unavailable local storage and preserve the Capture draft in its editor when save fails.
- Added local regression coverage for newly named workspaces, late account responses, settings hydration, Capture retry after a lost server response, and rejected offline writes.

New event triggers, scoped approval policies, structured RFQ intake, and smart quotation drafting remain pending.
