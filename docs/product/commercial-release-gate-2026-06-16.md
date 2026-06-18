# Memoire Commercial Release Gate

Date: 2026-06-16

Roadmap session: Session 2 - Release Gate And Risk Register

## Decision

Memoire is not ready for unrestricted public selling.

Memoire can move toward a 5-10 person controlled early-access cohort after the Session 3 and Session 4 gates are satisfied:

1. Production infrastructure controls are confirmed.
2. Two-account auth, RLS, sync, export, and deletion QA passes.

The product surface is close enough for cohort preparation. The remaining risk is no longer "missing product concept"; it is trust, isolation, cost control, monitoring, legal readiness, and operator workflow.

## Current Evidence Reviewed

Code and configuration:

- `src/App.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/auth/AuthProvider.tsx`
- `src/utils/dataMode.ts`
- `src/utils/earlyAccessRequests.ts`
- `src/utils/productAnalytics.ts`
- `src/features/legal/LegalPage.tsx`
- `src/features/pricing/PricingPage.tsx`
- `api/_auth.js`
- `api/_rateLimit.js`
- `api/request-access.ts`
- `api/ask-memoire.ts`
- `api/structure-capture.ts`
- `api/search.ts`
- `api/generate-embedding.ts`
- `api/capture-ai-classify.ts`
- `api/billing.ts`
- `api/stripe-webhook.ts`
- `vercel.json`
- `.env.example`

Database and release notes:

- `supabase/migrations/20260615124612_early_access_requests.sql`
- `supabase/migrations/20260615130620_product_funnel_events.sql`
- `supabase/migrations/20260615132000_cloud_browser_collections.sql`
- `supabase/migrations/20260615142321_move_vector_extension.sql`
- `supabase/migrations/20260615142528_explicit_server_only_rls.sql`
- `supabase/migrations/20260616103000_operator_funnel_measurement.sql`
- `docs/qa/public-selling-release-readiness-report.md`
- `docs/customer-journey-audit-2026-06-15.md`
- `docs/product/commercialization-roadmap-2026-06-16.md`
- `docs/product/cohort-validation-system-2026-06-16.md`
- `docs/product/cohort-release-evidence-packet-2026-06-17.md`
- `docs/product/cohort-support-contract-coverage-2026-06-17.md`
- `docs/product/activation-workflow-contract-coverage-2026-06-17.md`
- `docs/product/cloud-json-runtime-contract-coverage-2026-06-17.md`
- `docs/product/billing-paid-readiness-contract-coverage-2026-06-17.md`
- `docs/product/lead-operations-contract-coverage-2026-06-17.md`
- `docs/product/lead-operations-runtime-contract-coverage-2026-06-17.md`
- `docs/product/core-workflow-reliability-pass-2026-06-16.md`
- `docs/product/ai-disclosure-boundary-hardening-2026-06-17.md`
- `docs/product/trust-boundary-contract-coverage-2026-06-17.md`
- `docs/operations/early-access-support-incident-runbook-2026-06-17.md`
- `docs/operations/weekly-operating-review-template-2026-06-17.md`
- `docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md`
- `docs/operations/weekly-reviews/README.md`
- `docs/qa/accessibility-failure-state-qa-2026-06-17.md`
- `docs/qa/data-isolation-contract-coverage-2026-06-17.md`
- `docs/qa/data-isolation-runtime-contract-coverage-2026-06-17.md`
- `docs/qa/auth-recovery-contract-coverage-2026-06-17.md`
- `docs/deployment/ai-endpoint-rate-limit-coverage-2026-06-17.md`
- `docs/deployment/rate-limit-runtime-contract-coverage-2026-06-17.md`
- `docs/deployment/production-readiness-contract-coverage-2026-06-17.md`
- `docs/deployment/health-runtime-contract-coverage-2026-06-17.md`
- `docs/operations/billing-support-runbook-2026-06-17.md`
- `docs/qa/billing-payment-qa-2026-06-17.md`
- `docs/deployment/billing-checkout-exposure-guard-2026-06-17.md`
- `docs/qa/accessibility-failure-state-contract-coverage-2026-06-17.md`
- `scripts/verify-billing-paid-readiness-contract.mjs`
- `scripts/verify-accessibility-failure-state-contract.mjs`
- `scripts/verify-commercial-operating-loop-contract.mjs`
- `scripts/verify-commercial-readiness.mjs`
- `scripts/verify-ai-rate-limit-coverage.mjs`
- `scripts/verify-rate-limit-runtime-contract.mjs`
- `scripts/verify-health-runtime-contract.mjs`
- `scripts/verify-production-readiness-contract.mjs`
- `scripts/verify-data-isolation-contract.mjs`
- `scripts/verify-data-isolation-runtime-contract.mjs`
- `scripts/verify-lead-operations-contract.mjs`
- `scripts/verify-lead-operations-runtime-contract.mjs`
- `scripts/verify-auth-recovery-contract.mjs`
- `scripts/verify-trust-boundary-contract.mjs`
- `scripts/verify-support-cohort-contract.mjs`
- `scripts/verify-activation-workflow-contract.mjs`
- `scripts/verify-cloud-json-runtime-contract.mjs`

## Release Gates

### Gate A: Controlled Early-Access Cohort

Target:

- Invite 5-10 known users.
- Keep positioning as early access.
- Keep noindex active.
- Keep payment checkout inactive.
- Use manual follow-up and close observation.

Required before invite:

| Gate | Requirement | Status | Owner Type | Evidence Needed |
| --- | --- | --- | --- | --- |
| A1 | Production deployment has correct environment variables for Supabase, auth, AI providers, and app URL. | Readiness endpoint, static contract verifier, and local runtime health proof added; production evidence missing | Vercel / operator | Keep `npm run verify:production-readiness` and `npm run verify:health-runtime` passing, then confirm production `/api/health` returns HTTP 200 with `ok: true`, plus dashboard confirmation for required variables. |
| A2 | Distributed rate limits or access protection exist for expensive AI endpoints. | Firewall payload, app-level 429 contract, static route coverage verifier, and local runtime helper proof exist; active distributed rule evidence and deployed endpoint 429 proof missing | Vercel | Vercel Firewall, WAF, deployment protection, or equivalent rule evidence for `/api/ask-memoire`, `/api/search`, `/api/structure-capture`, `/api/capture-ai-classify`, and `/api/generate-embedding`; app-level 429 headers verified on one deployed expensive endpoint. |
| A3 | Two-account QA confirms no account data crosses users. | Static audit/protocol, export integrity guard, data-isolation contract verifier, and local runtime contamination proof exist; operational evidence missing | QA / Supabase | Keep `npm run verify:data-isolation` and `npm run verify:data-isolation-runtime` passing, then run manual QA for two users covering accounts, opportunities, captures, actions, review packs, assets, action outcomes, export manifest, and deletion. |
| A4 | Demo data cannot contaminate signed-in account data. | Demo/account contamination guards, data-isolation contract verifier, and local export contamination proof exist; operational evidence missing | QA / code | Keep `npm run verify:data-isolation` and `npm run verify:data-isolation-runtime` passing, then run browser QA proving demo reset, signup/login from demo, and real-account workspace clear demo records. |
| A5 | Request Access submissions are stored privately and operator can retrieve them. | Operator workflow schema, runbook, query pack, lead-operations verifier, and local runtime payload proof added; production evidence missing | Operator / Supabase | Keep `npm run verify:lead-ops` and `npm run verify:lead-ops-runtime` passing, then prove production retrieval and one completed lead workflow through owner/due/contacted/decision/retention steps. |
| A6 | Account recovery flow works on production domain. | QA runbook, health redirect checklist, auth recovery contract verifier, and local health redirect runtime proof added; production evidence missing | QA / Supabase | Keep `npm run verify:auth-recovery` and `npm run verify:health-runtime` passing, then confirm `/api/health` auth redirect URLs match Supabase Auth settings, plus forgot password, reset password, verification email, and Google OAuth redirect QA on production domain. |
| A7 | Production monitoring exists for errors and cost. | Readiness endpoint, client failure telemetry, static monitoring verifier, guarded operating loop, and local health runtime proof added; active monitor evidence missing | Vercel / operator | Keep `npm run verify:production-readiness`, `npm run verify:health-runtime`, and `npm run verify:commercial-operating-loop` passing, then confirm `/api/health`, `/api/client-log` events, API error rate, auth failures, failed cloud writes, lead submissions, AI spend, and Stripe webhook errors if enabled. |
| A8 | Legal pages are product-accurate for early access and clearly not final legal advice. | Static trust-boundary contract verifier added; legal review and deployed UX QA outstanding | Legal / operator | Privacy, Terms, Product Boundaries, route-level AI disclosure, Settings boundary copy, and AI-surface disclosures are statically verified; real jurisdiction and business-entity review remains outstanding. |
| A9 | First cohort has qualification, invite, support, interview, tracker, and stop/go process. | Static support/cohort contract verifier added; live support evidence missing | Customer validation / operator | Cohort plan, tracker, templates, support/incident runbook, in-app support guidance, and weekly review support fields are statically verified; live support inbox, named owners, first test support request, and completed cohort report still missing. |
| A10 | Core activation workflow can survive return usage. | Static activation workflow verifier and local cloud-merge runtime proof added; signed-in QA missing | QA / code | Keep `npm run verify:activation-workflow` and `npm run verify:cloud-json-runtime` passing, then run signed-in create/import -> brief -> save pack -> reload/login -> direct pack route QA evidence. |

Gate A decision:

- Hold until A1-A4 and A7 have evidence.
- A5 and A8 can be manual for the first tiny cohort if the operator accepts the risk and records the retention/follow-up process.
- Use `docs/product/cohort-release-evidence-packet-2026-06-17.md` as the single pre-invite signoff record before sending any cohort invite.

### Gate B: Paid Early-Access Checkout

Target:

- Turn on one paid early-access offer after cohort evidence.
- Avoid broad public pricing until willingness-to-pay is proven.

Required before checkout:

| Gate | Requirement | Status | Owner Type | Evidence Needed |
| --- | --- | --- | --- | --- |
| B1 | One paid offer is selected. | Missing current evidence | Customer validation / operator | Pricing decision memo: target user, price, limits, refund policy, trial model, and inclusion/exclusion list. |
| B2 | Stripe price IDs and webhook secret are configured. | Static paid-readiness contract verifier added; config unverified | Stripe / Vercel | Production env proof for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, selected `STRIPE_*_PRICE_ID`, and intentional `BILLING_CHECKOUT_ENABLED=true` only after B1-B6 are ready. |
| B3 | Checkout, portal, cancel, failed payment, and webhook status updates pass QA. | Static paid-readiness contract verifier added; Stripe run missing | QA / Stripe | Test-mode and production-mode billing QA report using `docs/qa/billing-payment-qa-2026-06-17.md`; keep `npm run verify:billing-paid-readiness` passing before and after QA. |
| B4 | Billing support runbook exists. | Static paid-readiness contract verifier added; offer-specific owners/evidence missing | Operator | Fill selected offer, price ID, refund/trial policy, owners, and run one test billing support case through `docs/operations/billing-support-runbook-2026-06-17.md`. |
| B5 | Pricing page copy matches actual offer. | Hypothesis mode guarded by commercial and paid-readiness verifiers; not ready for selling | Code / operator | `/pricing` updated from hypothesis to the selected paid early-access offer after B1; verifier updated or relaxed only when checkout is intentionally enabled. |
| B6 | Legal pages cover paid access terms. | Missing current evidence | Legal | Legal review for payment, refund, cancellation, service availability, and data export/deletion obligations. |

Gate B decision:

- Do not enable checkout yet.
- Billing code is present, but commercialization should wait for offer validation and payment QA.

### Gate C: Unrestricted Public Selling

Target:

- Open public signup and/or paid conversion beyond known users.
- Decide whether to relax `X-Robots-Tag: noindex, nofollow`.

Required before public selling:

| Gate | Requirement | Status | Owner Type | Evidence Needed |
| --- | --- | --- | --- | --- |
| C1 | Gates A and B have passed. | Not met | Cross-functional | Signed release decision. |
| C2 | First cohort shows clear activation and trust evidence. | Missing current evidence | Customer validation | Cohort report with activation, objections, retention, willingness to pay, and support load. |
| C3 | Production monitoring is reviewed weekly. | Static operating-loop verifier added; first completed review missing | Operator | Keep `npm run verify:commercial-operating-loop` passing, then save one completed weekly operating review with funnel metrics, support status, production health, logs, AI cost, release-gate decisions, and named owners. |
| C4 | AI spend controls are tested under realistic usage. | Missing current evidence | Vercel / operator | Cost ceiling, alerting, rate-limit evidence, and failure-mode QA. |
| C5 | Support and incident process exists. | Static support/cohort contract verifier added; operational evidence missing | Operator | Keep `npm run verify:support-cohort` passing, then confirm support inbox, primary/backup owner, first test support request, response target, incident severity policy, and escalation notes. |
| C6 | Accessibility and slow/failure states are tested. | Static accessibility/failure-state verifier added; operational QA missing | QA / code | Keep `npm run verify:accessibility-failure-state` passing, then run keyboard/focus/modal QA, mobile navigation QA, and slow/unavailable Supabase/AI/export/delete QA on protected production or preview. |

Gate C decision:

- Not ready.
- Revisit only after controlled cohort and paid early-access evidence exist.

## Surface Audit

### Public Routes

Current public routes:

- `/`
- `/login`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`
- `/pricing`
- `/demo`
- `/request-access`
- `/legal/privacy`
- `/legal/terms`
- `/legal/boundaries`

Strengths:

- Public route map is explicit.
- Demo and request-access routes exist.
- Pricing page says checkout is inactive and pricing is still being validated.
- Legal pages disclose local/browser data, analytics, AI-assisted features, human review, and product boundaries.
- `vercel.json` applies `X-Robots-Tag: noindex, nofollow`.

Open risks:

- Need production QA for auth email redirects and Google OAuth.
- Legal pages are product-ready copy, not reviewed legal terms for actual selling.
- Noindex should remain until public-selling go/no-go.

### Protected App Routes

Current protected app routes include:

- Dashboard
- Demo guide
- Capture
- Calendar
- Reviews
- Playbook
- Assets
- Journey
- Accounts
- Opportunities
- Pipeline onboarding
- Stakeholders
- Objections
- Pipeline Defense
- Review Pack
- Ask Memoire
- Settings

Strengths:

- App shell is behind `ProtectedRoute`.
- Demo workspace can access the app without account, but only when demo mode is active.
- Legacy routes redirect to V1 surfaces.
- Founder validation route is hidden unless founder workspace mode is enabled.

Open risks:

- The demo exemption must be retested so real account data and demo state cannot mix.
- Two-account route refresh and local cache ownership need current QA evidence.

### API Endpoints

Expensive or privileged endpoints:

- `/api/ask-memoire`
- `/api/search`
- `/api/structure-capture`
- `/api/capture-ai-classify`
- `/api/generate-embedding`
- `/api/anonymize`
- `/api/claude-extract`
- `/api/export`
- `/api/delete-account`
- `/api/billing`
- `/api/stripe-webhook`
- `/api/request-access`

Strengths:

- Most privileged endpoints require a Supabase user token.
- AI endpoints have input-size limits.
- AI endpoints have best-effort in-memory rate limits.
- Billing endpoint fails closed if Stripe is not configured.
- Billing endpoint validates allowed price IDs.
- Stripe webhook verifies the webhook signature.
- Request Access uses a server-side service-role insert into a private table.
- Product funnel events are privacy-minimized.

Open risks:

- In-memory rate limits are not enough for unrestricted public traffic.
- `/api/search` and `/api/generate-embedding` depend on OpenAI spend and need production spend alerts.
- Request Access and product funnel events share `/api/request-access`; this is acceptable but should be documented in operator runbooks.
- API error monitoring is not evidenced in repo.

### Supabase And Data Boundaries

Strengths:

- New early-access and funnel-event tables revoke anon/authenticated access and grant service-role only.
- New cloud browser collections use authenticated RLS scoped by `user_id`.
- The vector extension was moved to `extensions`.
- Policies use `(SELECT auth.uid())` in newer cloud collection migrations.
- README states user-owned tables should be scoped by `user_id` and RLS.

Open risks:

- Two-account RLS QA is still required on current production schema.
- Legacy/current columns still coexist and should remain a later data-consolidation task.
- Supabase leaked-password protection depends on the plan; if unavailable, the current password policy must be documented as the accepted mitigation for early access.

### Billing

Strengths:

- Billing code exists.
- Checkout requires auth.
- Checkout requires `BILLING_CHECKOUT_ENABLED=true`.
- Checkout only accepts configured price IDs.
- Portal requires existing Stripe customer ID.
- Webhook updates profile subscription fields from verified Stripe events.

Open risks:

- Pricing page still says checkout is inactive.
- No current evidence that Stripe production env vars are configured.
- No current evidence that webhook events update real production profiles.
- Billing support runbook exists, but no Stripe test-mode support case has been completed.

### Analytics And Learning Loop

Current tracked events:

- `demo_started`
- `demo_completed`
- `request_access_submitted`
- `signup_completed`
- `csv_import_completed`
- `review_pack_saved`

Strengths:

- Events avoid sales content, customer names, email addresses, and deal data.
- Events include route, data mode, and anonymous browser ID.
- Events are server-recorded in a private table.

Open risks:

- No current operator dashboard or SQL query pack exists.
- No current verification that all events fire correctly in production.
- No metric definitions exist for activation, cohort health, or conversion.

## Risk Register

| ID | Priority | Risk | Current Evidence | Owner Type | Required Action |
| --- | --- | --- | --- | --- | --- |
| R1 | P0 | Expensive AI endpoints can be hit beyond intended cohort limits. | App-level in-memory limits, standardized 429 headers, Vercel Firewall payload, static route coverage verifier, and local runtime helper proof exist; active distributed rule evidence is still missing. | Vercel | Apply and verify the Vercel Firewall/deployment protection/rate rules for expensive endpoints, then capture app-level 429 header proof on a deployed endpoint. |
| R2 | P0 | Cross-account data leakage or stale local cache ownership issue. | RLS exists in migrations, a QA matrix exists, export has an owner-column integrity guard, static data-isolation verifier, and local runtime contamination proof; operational two-account evidence is still missing. | QA / Supabase | Keep data-isolation verifiers passing, then run two-account QA covering read/write/delete/export manifest and local cache ownership. |
| R3 | P0 | Production failures are invisible during cohort. | `/api/health`, `/api/client-log`, and production-readiness contract verifier exist; dashboard/log-filter evidence still missing. | Vercel / operator | Set up API error, auth failure, cloud-write failure, lead submission, and AI cost monitoring. |
| R4 | P0 | Legal copy may not match actual selling jurisdiction or business entity. | Legal pages exist but are product copy. | Legal | Review Privacy and Terms before paid or broader public access. |
| R5 | P1 | Leads arrive in Supabase but no operator process handles them. | Lead queue schema, operator query pack, runbook, static lead-operations verifier, and local runtime payload proof exist; production workflow evidence missing. | Operator / Supabase | Apply workflow migration and run one production/protected-preview lead through claim, contact, decision, and retention acknowledgement. |
| R6 | P1 | Signup, reset, and OAuth redirects fail on production domain. | Auth code, health redirect checklist, QA runbook, and static auth recovery contract verifier exist; production-domain QA missing. | QA / Supabase | Run auth QA on production domain with email and Google using `docs/qa/auth-recovery-production-qa-2026-06-17.md`. |
| R7 | P1 | Funnel events are present but not usable for decisions. | Operator SQL query pack, service-role-only views, weekly review template, and static operating-loop verifier added; live weekly metrics missing. | Operator / Supabase | Keep `npm run verify:commercial-operating-loop` passing, then run the funnel query pack during the first operating review and save results in `docs/operations/weekly-reviews/`. |
| R8 | P1 | Checkout is accidentally exposed before offer and support are ready. | Billing code exists; pricing page says inactive; server-side checkout flag blocks Stripe Checkout unless explicitly enabled; commercial verifier checks public exposure, and paid-readiness verifier checks B1-B6 billing support/QA/pricing prerequisites. | Code / Stripe / operator | Keep pricing in hypothesis mode, keep `BILLING_CHECKOUT_ENABLED=false`, and keep `npm run verify:billing-paid-readiness` passing until Session 9 and Session 10 gates pass; update verifiers only as part of the signed B1-B6 paid-checkout release. |
| R9 | P1 | Demo data mixes with real account data after signup/login. | Code clears demo workspace on auth and demo Review Packs no longer sync to cloud; current QA missing. | QA / code | Test demo-to-account flow and reset behavior with realistic data, including Review Pack creation before signup/login. |
| R10 | P1 | AI/provider privacy expectations are unclear to users. | Legal copy, Settings boundaries, Ask Memoire, Daily Capture AI Assist, Quick Capture, and Pipeline local-draft boundaries now have a static trust-boundary verifier; deployed UX QA still missing. | Code / legal | Keep `npm run verify:trust-boundary` passing, verify visible AI disclosure near AI-assisted features in production, and keep copy aligned with configured providers. |
| R11 | P2 | Legacy schema fields create maintenance drag. | Prior QA notes say coexistence is intentional. | Code / Supabase | Schedule data consolidation after launch gates. |
| R12 | P2 | Accessibility gaps reduce trust in public selling. | Skip link, main landmark, mobile-nav Escape support, QA matrix, and static verifier added; browser QA still missing. | QA / code | Keep `npm run verify:accessibility-failure-state` passing, then run keyboard, focus order, modal escape, mobile, and slow/failure-state checks. |
| R13 | P2 | Supabase policy performance may degrade under scale. | Prior report notes repeated auth calls and duplicate permissive policies. | Supabase | Tune policies and indexes after active query usage is validated. |
| R14 | P2 | Change-email self-service is missing. | Customer journey audit marks it later. | Code | Add after paid checkout or support evidence shows need. |

## Operator Setup Checklist

Before inviting the first cohort:

- [ ] Confirm deployment URL and environment.
- [ ] Confirm noindex remains active.
- [ ] Confirm rate-limit or access-protection strategy.
- [ ] Confirm lead retrieval from `early_access_requests`.
- [ ] Confirm `operator_early_access_queue` returns new leads.
- [ ] Confirm `operator_owner`, `follow_up_due_at`, `contacted_at`, and `decided_at` workflow works.
- [ ] Define who replies to leads and within what target time.
- [ ] Confirm lead retention/deletion review process.
- [ ] Confirm support inbox and escalation owner using `docs/operations/early-access-support-incident-runbook-2026-06-17.md`.
- [ ] Confirm `npm run verify:support-cohort` passes before cohort invite.
- [ ] Confirm `npm run verify:trust-boundary` passes and record legal review or accepted-risk decision for A8.
- [ ] Confirm `npm run verify:activation-workflow` passes before signed-in activation QA.
- [ ] Confirm AI cost monitor and alert destination.
- [ ] Confirm weekly review cadence using `docs/operations/weekly-operating-review-template-2026-06-17.md`.

## Session 3 Update

Production control documentation now exists:

- `docs/deployment/production-infrastructure-controls-2026-06-16.md`
- `docs/deployment/vercel-firewall-cohort-rules.json`
- `docs/deployment/production-readiness-health-check-2026-06-16.md`
- `docs/deployment/operator-monitoring-signals-2026-06-16.md`
- `docs/deployment/app-rate-limit-contract-2026-06-17.md`
- `docs/qa/auth-recovery-production-qa-2026-06-17.md`
- `api/health.ts`
- `api/client-log.ts`
- `api/_rateLimit.js`

This updates A1 from "plan documented" to "readiness instrumentation exists, active production evidence still missing." A6 now has `/api/health` auth redirect output and a production QA runbook, but still needs deployed email/OAuth evidence. A7 now has readiness instrumentation plus client-side cloud-sync failure telemetry, but still needs active production log/dashboard evidence. A2 now has a Firewall payload and app-level 429 response contract, but still needs active distributed rule evidence.

The cohort gate still remains closed until those controls are applied and Session 4 two-account QA passes.

## Session 4 Update

Two-account QA documentation now exists:

- `docs/qa/two-account-data-isolation-qa-2026-06-16.md`

One export coverage issue was fixed:

- `api/export.ts` now includes `user_profiles`, `usage_monthly`, `review_packs`, `sales_assets`, `action_outcomes`, and `deals` in the owned cloud export.
- `api/export.ts` now blocks cloud export responses if any returned row does not match the authenticated user's owner column.
- `src/features/settings/ExportTab.tsx` now stops signed-in export when the cloud export endpoint returns an integrity or availability error.
- `docs/qa/export-integrity-guard-2026-06-16.md` documents the new manifest and QA evidence requirements.

This updates A3 and R2 from "static audit/protocol documented" to "static audit/protocol plus export integrity guard, operational evidence still missing." A4 still depends on demo-to-account QA evidence.

The cohort gate remains closed until the operational QA matrix passes against protected production or preview.

## Session 8 Trust-Boundary Update

AI disclosure and product-boundary hardening now exists:

- `docs/product/ai-disclosure-boundary-hardening-2026-06-17.md`
- `docs/product/trust-boundary-contract-coverage-2026-06-17.md`
- `src/features/v31/QuickCapturePanel.tsx`
- `scripts/verify-trust-boundary-contract.mjs`

Quick Capture now shows mode-aware disclosure before the user structures content: Quick Note mode warns that signed-in structuring may send the note to the configured server-side AI endpoint, while Email Thread mode clarifies that current structuring is local parsing.

`npm run check` now includes `npm run verify:trust-boundary`, which confirms:

- Public legal routes remain mounted.
- Privacy, Terms, Product Boundaries, and Settings boundaries still describe the current early-access product.
- Ask Memoire, Daily Capture AI Assist, Quick Capture, and Pipeline Draft Assist still disclose provider/local behavior.
- The A8/R10 evidence documents remain linked to legal-review and deployed-UX blockers.

This improves A8 and R10 by reducing trust-boundary drift, but it does not close legal review or deployed visual QA.

## Session 12 Support/Incident Update

Early-access support and incident readiness now exists:

- `docs/operations/early-access-support-incident-runbook-2026-06-17.md`
- `src/features/settings/ExportTab.tsx`
- `docs/product/cohort-support-contract-coverage-2026-06-17.md`
- `scripts/verify-support-cohort-contract.mjs`

The runbook defines support intake fields, severity levels, response targets, escalation behavior, data-handling rules for support exports, and C5 pass criteria. The app now gives users a support-package path in Settings -> Export & Delete.

`npm run check` now includes `npm run verify:support-cohort`, which confirms:

- Cohort validation plan, qualification score, 14-day workflow, interview script, and stop/go criteria remain intact.
- Outreach templates cover invite, clarification, onboarding, activation, closeout, not-a-fit, and paid-intent follow-up.
- Cohort tracker keeps activation, blocker, paid-intent, support, decision, and next-step fields.
- Early-access support runbook keeps support channel, owner expectations, severity levels, intake fields, incident workflow, data handling, and pass criteria.
- Settings -> Export & Delete keeps support package guidance and export sensitivity warnings.
- Weekly operating review keeps A9/C5 support review and confidentiality checks.

This improves C5 and A9 planning by reducing support-process drift, but C5 remains open until the support inbox, primary/backup owner, SEV0/SEV1 escalation owner, and first test support request are evidenced. Billing-specific support remains open for B4.

## Session 12 Weekly Operating Review Update

Weekly operating review readiness now exists:

- `docs/operations/weekly-operating-review-template-2026-06-17.md`
- `docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md`
- `docs/operations/weekly-reviews/README.md`
- `scripts/verify-commercial-operating-loop-contract.mjs`

The template ties together funnel metrics, cohort evidence, support incidents, production health, Vercel logs, Supabase errors, AI cost, release-gate decisions, go/no-go posture, and backlog policy. This improves C3 and the Session 12 operating loop, but C3 remains open until the first completed weekly review is saved with real production/cohort evidence.

`npm run check` now includes `npm run verify:commercial-operating-loop`, which confirms the weekly review template, operator funnel query pack, service-role-only funnel views, monitoring signals, weekly review storage location, and release-gate/cohort-packet references stay aligned. This improves R7 from missing query-pack evidence to static operating-loop coverage, but R7 remains open until the first review uses live funnel results for a decision.

## C6 Accessibility/Failure-State Update

Accessibility and failure-state readiness now exists:

- `docs/qa/accessibility-failure-state-qa-2026-06-17.md`
- `docs/qa/accessibility-failure-state-contract-coverage-2026-06-17.md`
- `scripts/verify-accessibility-failure-state-contract.mjs`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/index.css`

The app shell now has a keyboard-visible skip link to the main workspace content, a stable main landmark/focus target, and Escape-to-close support for mobile navigation. This improves C6 and R12, but C6 remains open until the keyboard, focus, modal, mobile, and slow/failure-state QA matrix passes on protected production or preview.

`npm run check` now includes `npm run verify:accessibility-failure-state`, which confirms the skip link, main landmark/focus target, mobile navigation Escape behavior, slow-loading fallback, protected-route fallback, route fallback, export/delete failure states, cloud-sync operational telemetry, AI fallback copy, and C6-01 through C6-17 QA coverage.

## Session 10 Billing Support Update

Billing support readiness now exists:

- `docs/operations/billing-support-runbook-2026-06-17.md`
- `docs/qa/billing-payment-qa-2026-06-17.md`

The support runbook covers checkout failure, portal failure, plan mismatch, cancellation, refund, failed payment, duplicate charge, billing with account deletion, Stripe lookup, severity, and evidence requirements. The QA matrix covers billing-disabled behavior, auth, invalid price blocking, checkout, cancel, success, webhook signature, profile updates, portal, cancellation, failed payment, refund, duplicate charge, and account deletion with billing.

`npm run check` now includes `npm run verify:billing-paid-readiness`, which confirms billing env defaults, `/api/billing` auth/flag/price guards, Stripe webhook signature/profile handling, inactive pricing copy, B3-01 through B3-15 QA coverage, billing support owner/procedure requirements, and B1-B6 checkout exposure prerequisites.

This improves B2, B3, B4, B5, and R8 readiness, but does not enable checkout. B1 remains open until one paid offer is selected. B3 remains open until Stripe test/live evidence exists. B4 remains open until owners, selected offer, price ID, refund/trial policy, and one test support case are recorded. B5 and B6 remain open.

## R8 Checkout Exposure Guard Update

Checkout exposure hardening now exists:

- `docs/deployment/billing-checkout-exposure-guard-2026-06-17.md`
- `scripts/verify-commercial-readiness.mjs`
- `api/billing.ts`
- `api/health.ts`
- `.env.example`

Stripe keys and price IDs no longer enable checkout by themselves. The billing endpoint requires `BILLING_CHECKOUT_ENABLED=true` before creating a Checkout session, and `/api/health` reports `billing_checkout_disabled` so operators can confirm checkout remains off during private beta. This improves R8, B2, and B3 readiness, but paid checkout remains blocked until B1-B6 have evidence.

## R8 Public-Surface Commercial Verifier Update

The commercial readiness verifier now protects the public beta posture as a code-level invariant:

- `vercel.json` must keep `X-Robots-Tag: noindex, nofollow`.
- Landing and pricing pages must keep checkout inactive copy visible.
- Landing and pricing pages must not call `startCheckout` or `useCheckout` while B1-B6 are still open.
- `npm run check` now includes `npm run verify:commercial`.

This reduces the chance that a future UI or deploy change accidentally turns Memoire into a paid public-selling surface before the paid-offer, billing support, Stripe QA, and legal gates are complete.

## Gate A Cohort Release Evidence Packet Update

Controlled-cohort signoff now has a single evidence packet:

- `docs/product/cohort-release-evidence-packet-2026-06-17.md`
- `scripts/verify-cohort-release-packet.mjs`

The packet defaults to HOLD and maps A1-A10 to required evidence, source artifacts, current status, and evidence links. It also records hard-stop rules, limited risk-acceptance rules, operator run order, and final go/no-go fields.

`npm run check` now includes `npm run verify:cohort`, which confirms the packet still:

- Covers A1-A10.
- Defaults to HOLD.
- Keeps checkout disabled for cohort entry.
- Keeps noindex active.
- Blocks high-risk invite failures such as cross-account exposure, failing health checks, and demo/sample contamination.

This does not open Gate A. It makes the remaining operational evidence work executable from one place instead of scattered across the release gate, infrastructure docs, QA docs, and cohort planning docs.

## A2 AI Rate-Limit Coverage Verifier Update

App-level AI endpoint protection now has an automated static coverage verifier:

- `docs/deployment/ai-endpoint-rate-limit-coverage-2026-06-17.md`
- `docs/deployment/rate-limit-runtime-contract-coverage-2026-06-17.md`
- `scripts/verify-ai-rate-limit-coverage.mjs`
- `scripts/verify-rate-limit-runtime-contract.mjs`

`npm run check` now includes `npm run verify:ai-rate-limits` and `npm run verify:rate-limit-runtime`. Together they confirm the five expensive routes still use the shared limiter before provider invocation, and the shared helper returns the documented local runtime 429/header/body behavior:

- `/api/ask-memoire`
- `/api/search`
- `/api/structure-capture`
- `/api/capture-ai-classify`
- `/api/generate-embedding`

The runtime helper proof also checks `Retry-After`, `X-RateLimit-*` headers, `retryAfterSeconds`, identity isolation, scope isolation, and forwarded-address fallback.

This improves A2 and R1 by preventing future code drift from bypassing or breaking app-level limits. It does not close A2 because production still needs active distributed rule evidence and deployed endpoint 429 proof.

## A1/A7 Production Readiness Contract Verifier Update

Production readiness and monitoring surfaces now have automated static and local runtime contract verifiers:

- `docs/deployment/production-readiness-contract-coverage-2026-06-17.md`
- `docs/deployment/health-runtime-contract-coverage-2026-06-17.md`
- `scripts/verify-production-readiness-contract.mjs`
- `scripts/verify-health-runtime-contract.mjs`

`npm run check` now includes `npm run verify:production-readiness` and `npm run verify:health-runtime`, which confirm:

- `/api/health` keeps the required GET/HEAD/no-store behavior.
- `/api/health` keeps required, warning, optional, checkout-disabled, and auth-redirect checks.
- `/api/health` does not expose raw environment values in the JSON response block.
- `/api/health` locally returns HTTP 200 with `ok: true` when required env is present.
- `/api/health` locally returns HTTP 503 with `ok: false` when required env is missing.
- `/api/health` locally derives auth redirect URLs from `VITE_APP_URL` without exposing secret values.
- `/api/client-log` keeps allowlisted operational events, sanitized fields, rate limiting, and the deployment-log marker.
- Readiness and monitoring docs remain aligned with the implementation.

This improves A1, A6, A7, and R3 by reducing contract drift and proving the local health response shape. It does not close A1, A6, or A7 because production `/api/health`, Supabase Auth dashboard, auth flow, deployment log-filter, owner, Supabase, and AI cost evidence still need to be captured.

## A3/A4 Data Isolation Contract Verifier Update

Account isolation and demo-to-account guardrails now have automated static and local runtime contract verifiers:

- `docs/qa/data-isolation-contract-coverage-2026-06-17.md`
- `docs/qa/data-isolation-runtime-contract-coverage-2026-06-17.md`
- `scripts/verify-data-isolation-contract.mjs`
- `scripts/verify-data-isolation-runtime-contract.mjs`

`npm run check` now includes `npm run verify:data-isolation` and `npm run verify:data-isolation-runtime`, which confirm:

- `/api/export` verifies the user token, filters every table by owner column, returns a manifest, and fails closed on contamination.
- `/api/export` local runtime contamination checks catch owner mismatches, malformed rows, `user_profiles.id` mismatch, and mixed clean/contaminated results.
- Settings export stops signed-in export when cloud export integrity fails.
- `/api/delete-account` checks the authenticated user before service-role deletion.
- Auth login/signup/OAuth completion clear demo workspace state before account workspace entry.
- Cloud JSON stores filter demo/sample records, use owner markers, and write tombstones for deletion.
- Review Packs preserve demo/sample markers and filter demo records before user cloud merge.
- Cloud JSON migrations keep `(user_id, id)` ownership, RLS, `WITH CHECK`, and anon revocation.

This improves A3, A4, and R2 by reducing isolation contract drift and proving the export contamination helper against representative rows. It does not close A3 or A4 because two-account operational QA, direct RLS negative tests, export inspection, deletion cascade proof, and demo-to-account browser evidence still need to be captured.

## A5 Lead Operations Contract Verifier Update

Request Access and early-access lead operations now have automated static and local runtime contract verifiers:

- `docs/product/lead-operations-contract-coverage-2026-06-17.md`
- `docs/product/lead-operations-runtime-contract-coverage-2026-06-17.md`
- `scripts/verify-lead-operations-contract.mjs`
- `scripts/verify-lead-operations-runtime-contract.mjs`

`npm run check` now includes `npm run verify:lead-ops` and `npm run verify:lead-ops-runtime`, which confirm:

- The public Request Access page keeps consent, privacy, confidentiality, honeypot, 2-business-day expectation, and event tracking.
- `/api/request-access` validates lead submissions, rate limits by work email, accepts honeypot spam quietly, and inserts leads with service-role access only.
- Request Access runtime payload helpers trim, cap, normalize, and map lead fields without storing the honeypot website field or raw consent boolean.
- The analytics event path remains privacy-minimized, allowlisted, rate-limited, and quiet-failing.
- Product funnel event runtime helpers allow only known events and data modes, blank routes with query strings/fragments, and reject short anonymous IDs.
- `early_access_requests` stays RLS-protected and service-role-only.
- Operator workflow migrations keep owner, due date, contacted, decision, note, daily queue, overdue follow-up count, and service-role-only views.
- The operator query pack keeps claim, contact, approve, decline/archive, and retention-review actions.

This improves A5, A9 intake readiness, and R5 by reducing lead-operations contract drift and proving local payload behavior. It does not close A5 because one production or protected-preview lead still needs to be processed through the workflow.

## A6 Auth Recovery Contract Verifier Update

Account verification, password recovery, reset-password, and Google OAuth redirects now have an automated static contract verifier:

- `docs/qa/auth-recovery-contract-coverage-2026-06-17.md`
- `scripts/verify-auth-recovery-contract.mjs`

`npm run check` now includes `npm run verify:auth-recovery`, which confirms:

- Public auth routes remain mounted.
- Signup verification redirects to `/login?verified=1`.
- Forgot-password requests redirect to `/reset-password`.
- Reset-password success returns to `/login?passwordUpdated=1`.
- Login shows verified/password-updated status messages.
- OAuth destinations are constrained to `/app/*` with `/app/dashboard` fallback.
- Auth completion still clears demo workspace state.
- `/api/health` auth redirect output and Supabase checklist remain aligned.

This improves A6 and R6 by reducing auth redirect contract drift. It does not close A6 because Supabase Auth dashboard settings and real email/OAuth flows still need production or protected-preview evidence.

## A10 Activation Workflow Contract Verifier Update

The signed-in activation workflow now has automated static and local runtime contract verifiers:

- `docs/product/activation-workflow-contract-coverage-2026-06-17.md`
- `docs/product/cloud-json-runtime-contract-coverage-2026-06-17.md`
- `scripts/verify-activation-workflow-contract.mjs`
- `scripts/verify-cloud-json-runtime-contract.mjs`

`npm run check` now includes `npm run verify:activation-workflow` and `npm run verify:cloud-json-runtime`, which confirm:

- Dashboard still routes users toward Import CSV, Add Opportunity, Demo, Pipeline Defense, latest Review Pack, and the trial activation checklist.
- Opportunities still supports `/app/opportunities?import=csv` and `/app/opportunities?new=1` as one-shot entry points and tracks Pipeline Defense Brief creation.
- Trial activation checklist still maps the core first-run milestones.
- Review Pack storage still uses workspace-aware loading, cloud merge, local fallback, demo-local handling, and cloud tombstones for deletion.
- Pipeline Defense still saves Review Packs, keeps demo packs local/sample-marked, tracks `review_pack_saved`, and links to the direct Review Pack route.
- Direct Review Pack routes still check browser and workspace sync before showing not-found.
- Cloud JSON merge behavior keeps the newest record, filters demo/sample records, respects tombstones, and prevents stale local collections from being claimed by a different account.

This improves A10 by reducing activation workflow drift and proving local cloud-merge behavior behind Review Pack return usage. It does not close A10 because the full signed-in create/import -> brief -> save pack -> reload -> logout/login -> direct pack route QA still needs production or protected-preview evidence.

## Session 2 Result

Session 2 is complete when this document exists and the roadmap points to Session 3.

Next best session:

- Session 3 - Production Infrastructure Controls.

First question for Session 3:

Which production control will Memoire use for expensive endpoints before inviting the first cohort: Vercel Firewall/rate limits, deployment protection, invite-only access, or a combination?
