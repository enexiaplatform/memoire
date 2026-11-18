# Enexia staging foundation

## Decision and current inventory

Use a dedicated **Memoire staging Supabase project** and a dedicated **`memoire-staging` Vercel project**, with a protected Preview at a stable staging origin. Keep these under separately approved nonproduction access and billing. Disable automatic Git deployments for the staging Vercel project or limit the project to an explicit staging branch. The production-linked Memoire Vercel project and its automatic PR Preview have no role in this rehearsal.

On 18 November 2026, the accessible Supabase organization reported the Free plan and two active projects, **memories** and **Bio-Wiki-Pro**. Memoire had only its default database branch. The Vercel team returned no Memoire custom environments and a zero custom-environment allowance. Supabase Free allows two active projects across organizations administered by the account. No eligible spare capacity or approved paid staging account was established. **Provisioning and hosted release verification are blocked.** [Supabase billing limits](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Vercel environments](https://vercel.com/docs/deployments/environments).

~~~mermaid
flowchart LR
    Tester["CI operator or release engineer"]
    App["Protected Vercel Preview in dedicated staging project"]
    Auth["Staging Supabase Auth"]
    Db["Staging Postgres and PostgREST"]
    Repo["Pinned Memoire migrations and PR candidate"]
    Tester -->|"attest origin, backend, SHA and flag"| App
    App --> Auth
    App --> Db
    Tester -->|"synthetic users and fixtures only"| Auth
    Tester -->|"staging migration comparison"| Db
    Repo --> App
    Repo --> Db
~~~

The candidate is Memoire PR #8 at `25dbdc9f1ce773b605009642b1425935408e2f3d` plus this staging adapter and tooling. Check its diff before deploying to staging. Record the **actual staging Git SHA**, preview origin, staging project ref, migration versions and evidence timestamps. The attestation is an environment binding and release check. Independently confirm project ownership, billing, database and Auth identities in the provider inventory before supplying any secrets.

## Environment isolation checklist

- Verify the staging Supabase project ref is distinct from **every** Enexia production or unrelated project. Create it empty or use a reviewed empty branch under a **staging** parent. Inventory both Auth issuer/project and PostgREST endpoint. Apply versioned schema migrations and synthetic fixtures.
- Verify the staging Vercel project ID differs from the production project and that its protected Preview has a stable dedicated `memoire-staging*.vercel.app` origin. Scope the staging environment variables to that Preview. Leave customer aliases, production branch integrations and production settings unchanged.
- Use only the approved staging ref for server Auth, browser Supabase, database migration and service credentials. Use separate Auth redirect URLs and a new protection bypass and probe token. Keep stage sign-ups and callbacks inside the designated environment.
- Leave automation, AI, checkout, cron, email and webhooks disabled on staging. Omit their credentials and endpoints. Leave analytics disabled. Keep staging mailboxes and integrations synthetic if later explicitly enabled.
- Run preflight before any Auth or database fixture write. The runner refuses the inventoried existing refs, unapproved origin shape, mismatched Supabase URLs, nonmatching deployment or redirects. The browser blocks requests to origins outside the attested app and backend. Treat an inventory mismatch or any unexpected request as an isolation failure.
- Protect the staging deployment with the team’s existing deployment protection. Keep PR #8 a draft. Publish staging evidence with gate names, timestamps and revisions. Omit passwords, tokens, raw headers, browser storage, traces with credentials and customer data.

## Credentials and access

| Scope | Inputs and permissions |
| --- | --- |
| Environment owner | Approved staging project ownership and budget. Supabase project or staging-branch creation rights. Vercel staging project creation, protection and Preview environment management rights. |
| App Preview | `SUPABASE_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the staging project. `SUPABASE_SERVICE_ROLE_KEY` stays server-only. Set `VITE_ENABLE_NATIVE_WORKSPACES=true`. See [configuration template](staging.env.example). |
| Attestation | `MEMOIRE_STAGING_ATTESTATION=true`, approved `MEMOIRE_STAGING_PROJECT_REF`, stable `MEMOIRE_STAGING_APP_ORIGIN`, and a new high-entropy `MEMOIRE_STAGING_PROBE_TOKEN` shared with the runner. The attestation requires Preview and the deployed Vercel Git SHA. Keep the optional automation bypass token scoped to the staging app origin. |
| Restricted runner | App Preview inputs, expected Git SHA, and if required a staging-only `MEMOIRE_STAGING_VERCEL_BYPASS`. Restrict service-role access to a release operator or an approved protected CI environment. The runner creates two confirmed synthetic users using random per-run credentials kept in memory, one workspace owner with two named books and one unrelated caller for access and revocation tests. |
| Migration operator | Verified direct staging DB connection and staging-only migration authority. Set `MEMOIRE_STAGING_DB_URL` and `MEMOIRE_STAGING_DB_ROOT_CERT` from the secret store on a disposable host with psql and staging network access. The rehearsal uses certificate verification. |

## Provisioning, migration and verification

1. **Authorize the target.** An owner must confirm empty isolated capacity and any incremental cost before creating provider resources. Create the dedicated staging project manually with the settings above. Use a restricted Preview. Map only the protected staging origin to this project.
2. **Establish the baseline.** From exact base `f888f06e5c86108a5509a561bbd72f551bf0cb89`, review and apply the repository migrations to the verified staging database using Supabase’s versioned migration flow and a staged dry run. Use explicit staging connection options. Do not link a workspace that already points to a production project. Verify migration history before seeding. [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations).
3. **Bind the candidate.** Build and deploy only the staging adapter plus the candidate to the dedicated protected staging Preview. Set the flag off. Use Vercel system Git SHA metadata and the approved staging inputs. Keep the Preview at the same origin through the flag rehearsal so the browser retains its journal. If the flag is a Preview environment variable, redeploy the same staging commit when toggling it. App and DB can be provisioned independently.
4. **Attest the target.** Use Node 22+ and repository-locked dependencies. Inject secrets from the approved store into this staging-only shell. Run `node scripts/staging/verify-pr01.mjs --preflight`. It performs a read-only protected attestation. A database or Auth mismatch blocks further work. Install Chromium for the integration runner using the repository’s Playwright tooling.
5. **Rehearse the upgrade.** Start `node scripts/staging/rehearse-migration.mjs` with the baseline database and flag off. Wait for the fixture-ready message. From the candidate checkout, review the Supabase migration dry run for that exact staging project. The only pending migration for this rehearsal is `20261118053205_plan_completion_receipts.sql`. Apply it through the staging migration flow. The runner verifies the two populated legacy rows before and after, and verifies SQL execution grants. The runner performs no schema changes by itself.
6. **Run hosted gates.** Turn on the staging flag, then run `node scripts/staging/verify-pr01.mjs --flag-rehearsal`. The runner uses real hosted Auth and PostgREST, captures offline, links existing Activity from Plan, holds a real acknowledgment during a workspace switch, and exercises replay, stale sync and session revocation. At the prompt, toggle only the staging flag off and on again on the same candidate and origin. Record only those results observed on the hosted run.
7. **Rollback and teardown.** Disable the flag to park queued intents. Preserve the additive migration, committed Plan links and receipts. Re-enable only after confirming the candidate and staging database. The runner attempts to remove only the synthetic Auth users created in the current run, with scope re-attested before cleanup. If cleanup fails, inspect the logged fixture run ID in staging, identify users by `app_metadata.enexia_fixture`, and confirm any cascade before removing them. Revoke test credentials and disable staging routing when idle. Destroy or pause only the explicitly approved temporary staging resources after preserving redacted results.

## Costs and controls

| Resource | Planning estimate in USD |
| --- | --- |
| Dedicated Supabase staging project | **$0/month** if an eligible Free project slot already exists. The current organization has both slots in use. A new approved Pro organization starts around **$25/month** with included Micro compute credit for a first project. A separate Micro project on an existing Pro organization is roughly **$10/month** once credits are used. |
| Temporary Supabase branch under an approved staging parent | Micro starts at **$0.01344/hour**, about **$0.65 for 48 hours** or **$9.68 for a 30-day month**, plus actual usage. Branching requires an eligible paid plan. |
| Protected staging Vercel project | Budget **$20/month** for Vercel Pro if a new commercial team or seat is needed, plus usage. An eligible existing team may already cover the seat and usage. Hobby is personal noncommercial only. |

A separate paid staging stack can start around **$45/month** before taxes, extra seats or usage. Actual entitlements are unconfirmed. Purchasing authorization and spare eligible capacity remain unavailable. Agree a cap before procurement, keep provider spend controls enabled, use one shared foundation with small synthetic datasets, limit test runs, and assign a named teardown owner and expiration when creating temporary capacity. [Supabase pricing](https://supabase.com/pricing) · [Supabase branch usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching) · [Vercel pricing](https://vercel.com/pricing).

## Reuse by Helm, Forge and Sentinel

Reuse the checklist, protected app per product, target attestation contract, scoped runner secrets, synthetic fixture conventions, evidence format and cost controls. Default to separate per-product staging projects or verified isolated branches under a funded staging parent. Use explicit disposable tenant/workspace mappings for cross-product tests. Give Helm read-only fixture projections, Forge narrowly scoped synthetic execution events, and Sentinel synthetic observation and retraction payloads. Product contract runners own their fixtures and version checks. Dedicated test signing keys and endpoints connect the staging products.

## PR-01 hosted release gates

Run `node --test test/unit/stagingIsolation.test.mjs` to verify that configuration rejects reserved targets and that the probe rejects production and bad credentials. This test uses no hosted keys.

All four gates below remain **BLOCKED** pending a verified hosted target and permissions. PR #8 at the pinned correction remains a draft. The [exact-head CI run](https://github.com/enexiaplatform/memoire/actions/runs/44315014365) passed all jobs. It provides disposable PostgreSQL/PostgREST and synthetic browser evidence.

| Gate | Hosted evidence required |
| --- | --- |
| 01 · Auth and session revocation | Successful staged login, verified cross-user denial, real Auth sign-out, rejected replay with the captured staged JWT, unchanged Plan. |
| 02 · Offline and acknowledgment | Both real Capture and Plan entry points with the same staged Activity IDs. Show persisted pending intent offline, committed receipt after reconnect and unchanged request key on retry. |
| 03 · Workspace switch | A committed request held before browser delivery, switch into another named book, no projection or queue leak there, replay when returning to the first book. |
| 07 · Upgrade and rollback | Legacy Plan/Activity rows equal before and after staged migration. New writes park with flag off and resume with original keys on the same staged origin. Verify existing links and receipts. |
