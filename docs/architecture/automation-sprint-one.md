# Automation Sprint 1

The first release adds three opt-in workflows inside the existing navigation:
Settings → Automations, internal reminders in Plan, and a saved cloud brief on
Today. No workflow is enabled for an existing account by migration or deployment.

## Source inventory and scope

`plan_items` already persists editable work and completion marks. Quotes already
use owner-scoped JSON rows; `commercial_commitments` holds accepted promises;
opportunities and sales activities provide recorded pipeline context. The server
digest already supplies a bounded, factual brief. The commercial webhook queue
is an outbound transport audit, not a general business-action queue, so it is not
repurposed to store Plan work.

Only two storage tables are added: `memoire_automation_settings` for versioned
standing permissions and `memoire_automation_runs` for durable daily execution
receipts, leases and retry state. Created work remains in `plan_items`. Both new
tables are owner-readable under RLS and included in cloud export. They are
archive-only during restore: restoring a backup cannot reactivate permissions or
replay scheduled work. Plan metadata survives the existing store sanitizer.

## Behavior

- A named IANA timezone and start hour determine the business date. The scheduler
  may run later in the day and catch up; only one completed run is permitted per
  owner and local date, including explicit **Run now**. New rules after a completed
  run take effect on the next local day. Preview has no write effects.
- Sent/Revised quotes become eligible after the configured interval from their
  recorded quote date. Accepted/Rejected/Expired quotes, received POs and linked
  inactive/closed/Lead opportunities do not create new quote reminders. This is
  based on recorded state, not the actual email send time or inbox replies.
- Open commitments become eligible within the configured due-date window or
  when overdue. Plan-derived promises cannot create reminder loops. A dated deal
  next action already visible on Plan suppresses additional work.
- Source/date keys map to deterministic SHA-256 Plan IDs. Retries, completed or
  dismissed reminders and even deletion tombstones do not recreate the same
  work or consume the next day's creation limit.
- Untouched automatic reminders can be dismissed when their source is no longer
  eligible. Completed, deleted or manually edited Plan items are preserved.
- The optional Today brief reuses the existing server digest. It is a saved cloud
  snapshot, labelled with its business date; it does not replace the current
  browser-derived Today picture and does not send email.

## Authority and concurrency

The existing `/api/commercial` function slot routes `resource=automations` to the
authenticated settings/history/preview/manual-run handler and
`resource=automation-worker` to the scheduler. Worker requests require the
server-only `CRON_SECRET`; request bodies cannot select an owner. User requests
use JWT verification and the caller's RLS. A privileged client is used only to
execute an explicitly enabled owner's run.

The database claims one owner/day under an advisory lock, grants a two-minute
lease, and permits at most three attempts per day. Expired leases can be
reclaimed; old workers cannot finish a replacement's run. A consistent bounded
snapshot is evaluated by a pure preparation function. Final application rechecks
the settings revision, enabled state, business date, lease and complete source
fingerprint. Changed source rows cause a retryable failure with no writes.

Plan inserts, untouched-reminder retirement and the completed receipt commit in
one transaction. A later invalid candidate rolls back earlier inserts. A lost
response after commit cannot downgrade the completed run or duplicate its work.
Existing source rows are locked during final application; independent inserts
after that snapshot belong to later knowledge and are not overwritten.

Snapshots refuse more than 5,000 rows in any source or 5 MB in total. The worker
uses ordered keyset paging and a 45-second processing budget. Page/budget limits
and failed owners return an explicit incomplete/failed result, never a success
over a silently truncated workspace.

## Deployment requirements

Apply migration `20261020153802_memoire_automation_sprint_one.sql` only after the
repository's normal target, migration-ledger, backup and restore-rehearsal gates.
Memoire shares its Supabase project with Helm; local tests do not authorize or
prove Production schema readiness.

Set server-only `AUTOMATION_ENABLED=true`, `CRON_SECRET`, and the existing
`SUPABASE_SERVICE_ROLE_KEY` to make execution available. No new provider, AI key
or customer-message permission is required. Without configuration, the UI allows
preview when storage is available, blocks enabling, and reports the limitation.
The Vite development middleware uses the same handlers.

A scheduler must call GET or POST
`/api/commercial?resource=automation-worker` with
`Authorization: Bearer <CRON_SECRET>`. The worker accepts no owner selector.
Use a supported deployment scheduler at least hourly for hour-level timing.
Do not add an hourly Vercel schedule to a plan that only permits daily cron.
Supabase Cron with pg_net is an alternative after confirming those extensions
and storing the destination and bearer secret in Vault. Follow the current
[Supabase scheduling guidance](https://supabase.com/docs/guides/functions/schedule-functions).
Never place credentials in a migration, repository file, browser or URL.

Saving settings or passing configuration checks does not prove that a scheduler
is installed. Confirm an authenticated owner's run receipt and generated Plan
items after closing the browser. The current UI deliberately does not claim
scheduler verification from environment flags alone.

## Verification boundaries

`test/unit/automation.test.mjs` exercises the actual migrated PostgreSQL-compatible
schema and API/worker handlers: RLS, permission denial, preview, retries, leases,
pause, source races, atomic failure, uncertain acknowledgement, tombstones,
manual edits, timezone windows and bounded creation. These use fictional users
and records and do not send messages or modify Production.

Browser verification uses the actual React controls with a visibly fictional
transport for enable/preview/save/run/repeat/pause/error states. Its 390×900 frame
checks responsive layout. It is UI evidence, not cloud or scheduler acceptance.
Production release separately requires exact-commit CI, deployment READY, schema
readiness, authenticated smoke and a confirmed scheduled run.
