# PR-01 Plan completion receipts

The authenticated Capture **Mark done** and Plan **use existing Activity** paths call the same command. The existing Activity row stays canonical. The new-touch path, guest/demo behavior, and separate commercial promise action retain their existing entry points.

## Migration and staging

- The migration creates a private receipt table and index, a narrowly granted command, and a legacy-write guard. It does not rewrite existing Plan or Activity rows. Restore can read and insert both legacy Plan payloads and receipt-era payloads. Where the account already has a managed completion, stale restore or old-client payloads without the matching revision cannot overwrite it.
- Configure the migration on an isolated staging database before setting `PLAN_COMPLETION_ENABLED=true` on its API. The API requires a verified user token and explicit default or named scope. The database checks the live Auth session and named owner mapping in the command transaction. Service credentials stay server-side. The flag defaults off. The browser persists intents by login and workspace and retries the same request key.
- An online Plan operator can still explicitly select a promise update. Only a directly acknowledged new completion can invoke that separate action. After an unknown result or offline save, the operator reviews the promise separately. Receipt replay never invokes it.
- Run the **Plan completion on PostgreSQL and PostgREST** CI job for independent connection races, role denial, named scope, and session revocation. The unit suite covers populated upgrade snapshots, injected receipt failure, grouped/derived sources, stale legacy writers, reopen, offline pending state and response loss. CI uses synthetic Auth inputs. Validate the full Capture/Plan UI against the staging Supabase Auth and Data API configuration before enabling a cohort.

## Rollback

Disable `PLAN_COMPLETION_ENABLED` and keep the forward-compatible frontend active. New or already queued link intents remain pending. Other Plan paths continue with their existing behavior. Keep the migration in place so confirmed links, receipts and legacy-write protection remain intact. Re-enabling with the same database reconciles pending commands using their original request keys. A pre-PR client can read the completion but cannot edit a managed row without its revision. Prefer re-enabling or forward fixing over removing the database guard while old clients can sync.
