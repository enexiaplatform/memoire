# Production gate resolution — 2026-10-02

## Verified now

Supabase project `mlmpcpkucurylkrobain` is `memories`, ACTIVE_HEALTHY, PostgreSQL 17.6.1.104 in ap-south-1. Its fresh migration ledger contains 133 entries, latest `20260930111633`. The repository contains 68 migrations; the 24-file forward chain from commercial conditions through dashboard definitions has no recorded versions on the live target. This is migration drift, not permission to mark those versions applied.

Live `portfolio_records`, `report_definitions` and `dashboard_definitions` are absent. The shared project overview identifies the latest migration as Helm's intelligence/RLS work and reports no backups on the Free organization. The dashboard Connect dialog supplies direct/session endpoints with `[YOUR-PASSWORD]`, not the existing database password. `.env.local` and process environment contain no usable PostgreSQL backup connection; no PostgreSQL command-line client was found through the inspected executable search.

The fresh ledger and SHA-256 forward inventory are retained under ignored `.memoire-private/production-gate-2026-10-02/`. These files are metadata, **not a recoverable backup**.

## Authentication configuration repaired

The actual Auth allowlist contained only three routes on an obsolete Preview. The user explicitly approved saving these six exact URLs, and the saved dashboard now shows nine entries:

| Host | Paths added |
| --- | --- |
| `www.memoire-official.com` | `/login?verified=1`, `/reset-password`, `/app/today` |
| `memoire-git-main-enexiaplatforms-projects.vercel.app` | `/login?verified=1`, `/reset-password`, `/app/today` |

Site URL stays `https://www.memoire-official.com/`. The old entries remain. No wildcard host, broader provider scope, anonymous access or confirmation bypass was enabled. Exact paths follow [Supabase redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls).

On the configured application origin, the Google Identity Services button retains its nonce-protected ID-token flow. Other origins use the existing Supabase Google provider redirect, avoiding the GIS requirement to register each new Preview origin with Google. The provider is enabled on the live target. OAuth returns to the fixed `/app/today` callback, then restores the requested internal destination from the browser's existing pending marker. Startup failures and timeouts return an actionable error and release the loading state.

Use the stable main Preview host above for live auth acceptance; immutable deployment URLs have not been added to the allowlist. Adding redirects and proving the mocked handshake are **not proof** that a real Google account has completed login, or that new cloud tables persist records. Real login, email recovery, cloud CRUD/reload and two-owner isolation remain separately recorded acceptance steps.

## Backup preparation and remaining dependency

`scripts/backup-production.ps1` prepares a full PostgreSQL custom archive and a role export without role passwords. It accepts only the verified direct or session-pooler endpoint on port 5432, requires a PostgreSQL 17 client and a new directory outside the checkout, passes the password through process environment, enforces encrypted read-only connections and leaves existing backup directories untouched. It retains checksums and explicitly marks restoration as NOT_RUN. Missing credentials were tested to fail before any dump or mutation.

The verified IPv4 session connection template is:

```text
postgresql://postgres.mlmpcpkucurylkrobain:[EXISTING-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
```

The existing password must be configured privately in `DATABASE_URL`. Dashboard/SQL API access cannot supply that password. A password reset is an authentication-credential change and may disrupt other applications sharing this database; it has not been performed. If a reset is necessary, the operator must complete that credential change and coordinate the other consumers.

Once the connection is available, install/use an official compatible client, run the dump to a private recovery directory outside the checkout, validate archive contents, restore into an isolated compatible PostgreSQL/Supabase environment, compare schema/roles/data/ledger and include separate Storage-object recovery evidence. Then replay the captured shared baseline with the reviewed Memoire reconciliation. Follow the [release runbook](next-gen-core-release-runbook.md) for migrations, history/restore, RLS and authenticated browser acceptance before application promotion.

**Production remains blocked on a usable database connection, a recoverable backup with restoration evidence, shared-target reconciliation and real cloud acceptance. No Production migration, ledger repair, database password reset or application promotion occurred.**

## Human task-time measurement prepared

The user chose to run the trial personally. [The local session page](../qa/usability-session.html) is served at `http://127.0.0.1:5174/docs/qa/usability-session.html`, using an origin separate from existing local workspaces. It seeds the same fictional fixture used by the integration journey and refuses to overwrite an existing workspace or auth session. It does not authenticate or write to cloud.

Five tasks cover classification, scoped report, dashboard, source inspection/reload and Collections. The timer starts only on the participant's explicit action. Completion, failure, help requests and notes are self-reported. JSON export stays local; no analytics service receives the records. The timer software was tested in disposable browser contexts. Those automated rows are not participant observations.

Operator verification criteria: Alpha classified as Brand A; scoped report includes Alpha and Won, excludes Beta and unqualified Lead; pipeline 100 and won value 50; saved dashboard references that same report and pipeline; drill-through shows the same sources; Collections order 60 less receipt 20 leaves 40 outstanding. Do not feed these answers to the participant before the trial.

A single founder trial diagnoses problems; it does not validate every persona, task time improvement or cloud performance. Retain the exported observations and check the achieved state before counting each self-reported completion as independently verified.

## Source validation

Full source check: 2,078 tests passed with zero failures, build, API typecheck, lint and contract suite. Final auth build/lint and auth-recovery contract passed; isolated mock OAuth verifies exact callback, retained report destination and no GIS request from Preview; timer persistence/help handling and shared-fixture product linkage passed. Live release and account acceptance evidence is retained separately in the private delivery record.
