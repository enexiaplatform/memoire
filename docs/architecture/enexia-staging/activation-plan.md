# Staging cost and activation plan

Inventory and public list prices checked 18 November 2026. Estimates are USD before tax, extra seats, and usage. No provider resources or billing settings were changed.

## Infrastructure inventory

| Surface | Observed | Decision |
| --- | --- | --- |
| Supabase | One visible Free organization with two active projects, Memoire's **memories** project and **Bio-Wiki-Pro**. Memoire has only its default branch. | Both existing projects are reserved. The Free limit applies across organizations where the operator is an owner or administrator. No eligible spare project or isolated branch was verified. [Free project limits](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| Vercel | The visible team, `enexiaplatforms-projects`, lists 16 projects including Memoire, Helm, Forge and Sentinel. No dedicated Memoire staging project was listed. Memoire's custom-environment response returned zero allowance. | The connector did not expose the team's billing plan or project-creation entitlement. An owner must confirm eligible commercial Preview capacity, project creation and deployment protection. |
| Release | [Draft PR #8](https://github.com/enexiaplatform/memoire/pull/8) remains at `25dbdc9f1ce773b605009642b1425935408e2f3d`. [Exact-head CI](https://github.com/enexiaplatform/memoire/actions/runs/44315014365) passed. | Five gates have passing isolated or repository evidence. The four hosted gates remain blocked. |

## Cost comparison

| Option | Incremental cash estimate | Auth and DB isolation | Risk and repeatability |
| --- | --- | --- | --- |
| Reuse approved nonproduction capacity | **$0** if an eligible empty target and protected commercial Preview already have unused capacity. | Separate project or verified data-less branch with its own Auth issuer, keys and database. | Lowest overhead. Verify project IDs, billing and fixture compatibility. No eligible target is visible. |
| Empty branch under a **nonproduction** parent | **$0.65** for 48 hours of Micro branch compute or **$9.68** for 30 days, plus the paid parent and usage. Compute credits exclude branch compute. | Separate database, Auth and URL. Review inherited configuration and deployed functions. | Repeatable once a staging parent exists. Confirm the pre-PR baseline because automatic branch migration can skip the upgrade rehearsal. |
| Dedicated managed project kept monthly | **$0** with an eligible Free slot. Otherwise **about $25/month** for a separate Supabase Pro organization with its first Micro normally covered by credits, or **about $45/month** if Vercel Pro is also needed. | Separate Auth, database, secrets, billing and access. | Low operator overhead. Recurring fees are justified only by regular use. |
| Temporary managed project with teardown | **$0–$0.65** for about 48 hours of standalone Micro compute on an existing approved paid nonproduction organization, depending on unused compute credits. New Supabase Pro starts at **$25 charged upfront**, plus **$20** if Vercel Pro is needed. | Same boundary as a permanent managed project. | Reuses both runners. Project deletion stops compute. A Supabase downgrade can leave unused subscription time as account credit. Budget the upfront charge. |
| Self-hosted isolated VPS | Example EU VM rates imply **$0.50–$0.77 for 48 hours** or **$6.49–$9.99/month**, before IP, backups, egress and operator time. | Dedicated network and database, fresh GoTrue signing keys, independent issuer and TLS. | Highest burden. The full Supabase stack recommends 8 GB RAM, 4 cores and 80 GB SSD. Requires hardening, HTTPS, upgrade and teardown ownership, and a tested app runtime. The current runner accepts managed Supabase and a protected Vercel Preview. A reviewed host adapter and release-owner decision on parity are required before using this option to close gates. |

[Supabase compute and credits](https://supabase.com/docs/guides/platform/manage-your-usage/compute) · [Branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching) · [Branch contents](https://supabase.com/docs/guides/deployment/branching) · [Subscription downgrade credits](https://supabase.com/docs/guides/platform/manage-your-subscription) · [Vercel pricing](https://vercel.com/pricing) · [Self-hosting requirements](https://supabase.com/docs/guides/self-hosting/docker) · [Illustrative VM pricing](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/).

**PR-01.** Prefer eligible existing capacity. The fallback is one empty managed staging Supabase project and a protected Preview in a separate `memoire-staging` Vercel project on an approved existing commercial team. Use a stable Preview origin and a 48-hour test window once access and checkout are ready. A cheap VPS is a contingency for a maintained host with approved parity. Its VM rate excludes the engineering needed to adapt and validate the release runner.

**Future Enexia products.** Share the environment manifest, exact-SHA attestation, scoped credentials, budget controls, synthetic fixture format and evidence tooling. Use distinct product projects or short-lived branches under approved nonproduction parents. Helm, Forge and Sentinel can exchange synthetic fixtures using staging-only signing keys and explicit workspace mappings. Keep always-on capacity only when usage supports the recurring cost.

## Exact owner actions before activation

| Owner | Decision or access required | Evidence |
| --- | --- | --- |
| Supabase organization owner | Identify and delegate an eligible empty nonproduction project or paid staging parent. If none exists, approve a separate nonproduction project or organization and its spend. | Approved organization and ref, plan and credit balance, project-scoped key and migration permissions. The existing Free organization is outside this change. |
| Vercel team owner | Confirm an eligible commercial team and permission to create a separate staging project, protect its Preview and manage a stable alias. Approve a new plan or seat only if reuse is unavailable. | Staging project ID, deployment permissions, Preview protection and approved usage allowance. |
| Release and security owner | Provide stage-only secret-store access, approve migration and flag operators, set a spend ceiling and expiry, and assign teardown ownership. | Secret metadata bound to the staging project and Preview, a run window, and a redacted evidence location. |

Unknown capacity, permission, protection or spend is a blocker. No free slot was verified and no paid provision was approved. Do not enter secrets in PR text, chat or build logs.

## Provisioning checklist and deployment order

1. **Record approvals.** Pin the proposed staging project ref, Preview project ID and stable origin, billing account, spend ceiling, operator and expiration. Compare these against the production and unrelated inventory. If using a branch, keep data copying off and review inherited settings, functions, webhooks and callbacks. Use a nonproduction parent.
2. **Establish the database baseline.** In a clean worktree at `f888f06e5c86108a5509a561bbd72f551bf0cb89`, have the authorized operator apply the reviewed staging-only baseline migrations. Use Supabase CLI with explicit staging TLS connection settings and a dry run. Record migration versions. Confirm `memoire_confirm_plan_completion` is absent. Disable automatic candidate migrations for the rehearsal. [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations).
3. **Bind credentials and deploy a protected Preview.** Use the [staging variable template](staging.env.example). Compare provider Auth, REST and DB endpoints with the approved project ref. Use a dedicated staging Vercel project with no Secret or Configuration imports from the commercial app. Vercel Authentication avoids the extra password-protection charge. Confirm anonymous access to the exact Preview alias is denied before sending any credentials. Expose Vercel system Git metadata. Deploy the exact staging candidate to Preview with `PLAN_COMPLETION_ENABLED=false`. Keep the alias stable through the rehearsal. [Vercel deployment protection](https://vercel.com/docs/deployment-protection) · [System Git variables](https://vercel.com/docs/environment-variables/system-environment-variables).
4. **Attest and run the baseline rehearsal.** Load secrets from the approved store into a staging-only process. Run `verify-pr01.mjs --preflight`, then `rehearse-migration.mjs`. Wait for its fixture-ready message. From the candidate checkout, verify the dry run proposes only `20261118053205_plan_completion_receipts.sql`. Apply it to the approved staging project using the existing versioned migration flow. Save row equality and grant checks. An already-migrated database needs a fresh isolated baseline.
5. **Run hosted verification.** Enable the flag on the same protected staging origin and SHA. Run the hosted verifier with `--flag-rehearsal`, then redeploy that same staging revision with the flag off and on when prompted. Preserve the alias and browser origin. Capture redacted evidence by gate and deployment ID. The rollback parks queued intents and preserves committed links and receipts.
6. **Teardown and close billing.** Confirm synthetic fixture cleanup. Revoke stage-only secrets and bypass credentials. Remove the staging alias and delete only the approved disposable resources. Record actual occupied hours, final invoices or credits, and subscription renewal status. Supabase project deletion stops compute; the billing owner separately owns plan renewal. Preserve redacted evidence.

~~~bash
# Run from the staging tooling checkout after verified provider setup.
node --test test/unit/stagingIsolation.test.mjs
node scripts/staging/verify-pr01.mjs --preflight
node scripts/staging/rehearse-migration.mjs

# After the migration rehearsal, enable the staging flag on the same origin.
node scripts/staging/verify-pr01.mjs --flag-rehearsal
~~~

## Credential verification without a production request

| Credential | Required evidence |
| --- | --- |
| Supabase publishable and service keys | Created under the approved staging project and accepted by its attested API. Legacy claims must match the staging ref and role. Opaque keys have no inspectable project claim. Use provider issuance metadata and stage-only acceptance. |
| Auth JWT | GoTrue verifies the synthetic user at the approved staging origin. The runner matches issuer, subject, session ID and any project claim to the approved target. Offline tests reject a production issuer and mixed-project claims. |
| DB connection | The migration rehearsal requires the exact direct staging DB host, verifies its certificate, and rejects reserved refs, foreign hosts and downgraded TLS. |
| Vercel access | Confirm project-level permission metadata or have the authorized staging operator deploy. Use a bypass secret created for that project and scope it to the protected staging origin. Leave production-capable management tokens outside the runner. |

Offline tests establish rejection by the guards. Hosted credential provenance and actual access boundaries remain **BLOCKED** until the owner supplies the target. The rehearsal sends no request to production. **NO-MERGE** remains in force for PR #8. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwts).
