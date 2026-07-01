# Memoire Commercialization Roadmap

Date: 2026-06-16

## Purpose

This is the operating roadmap for moving Memoire from private beta into real commercialization.

Each future full work session should advance roughly 5-10 percent of this roadmap. The default planning unit is 12 sessions, or about 8.3 percent per session. A session is complete only when it leaves behind a concrete artifact: code, QA evidence, deployment evidence, customer feedback synthesis, pricing decision, or an updated roadmap note.

## Current Product Truth

Memoire is a personal B2B sales memory and pipeline-review workspace for individual sales professionals.

As of 2026-07-01, the target-user language can broaden to include solo operators who sell without a sales team: founder-led sellers, consultants, freelancers, agency owners, and creators selling client work, partnerships, workshops, sponsorships, or services. This is a positioning expansion, not a product-scope expansion. The canonical note is `docs/product/solo-operator-persona-expansion-2026-07-01.md`.

The strongest current wedge is:

1. Try a focused demo.
2. See weak pipeline signals.
3. Generate or review a Pipeline Defense Brief.
4. Save or copy a manager-ready Review Pack.
5. Request early access or create an account.

The V1 product flow remains:

Quick Capture -> Structure -> Today Actions -> Account Memory -> Ask Memoire

The wedge remains personal sales memory and stuck-deal prevention. Memoire should not expand into invoicing, inventory, ecommerce, marketplace operations, delivery/project management, team CRM, or general task management for this persona.

Current commercial status:

- Public landing, pricing, demo, legal, signup, login, and request-access routes exist.
- Request Access is now server-backed through `api/request-access.ts`, not only local-only.
- Early-access requests are stored in `early_access_requests` through a service-role endpoint.
- Privacy-minimized funnel events are stored in `product_funnel_events`.
- Stripe billing code exists, but pricing page still positions checkout as inactive and pricing as a hypothesis.
- Public selling remains blocked by infrastructure, operational, QA, legal, monitoring, and cohort validation work.

## Commercialization Principle

Do not optimize for feature volume. Optimize for a buyer reaching trust, value, and willingness to pay with minimum operational risk.

The order of priority is:

1. Trust: privacy, data boundaries, auth, RLS, rate limits, export, legal readiness.
2. Value: demo-to-aha path, first real pipeline review, account memory, useful follow-up actions.
3. Activation: signup, onboarding, CSV import, first brief, return usage.
4. Evidence: funnel events, support notes, cohort feedback, observed objections.
5. Monetization: pricing packaging, payment, billing support, conversion measurement.
6. Scale: monitoring, cost controls, performance, support operations, team features later.

## Definition Of Commercial Readiness

Memoire is ready for controlled paid commercialization when all of the following are true:

- A new visitor can understand the product, try the demo, and request access without confusion.
- A new signed-in user can create or import a small pipeline, reach the first review outcome, and return later without losing data.
- Two-user QA proves account isolation, cloud sync behavior, demo isolation, export, and deletion paths.
- AI endpoints have effective cost controls, request limits, input limits, and monitoring.
- Production monitoring covers API errors, auth failures, failed cloud writes, lead submissions, and AI spend.
- Privacy, Terms, and Product Boundaries match the real selling jurisdiction and business entity.
- The first validation cohort produces evidence that at least one narrow buyer segment will pay for the workflow.
- Pricing and checkout are enabled only after the product has operational support for failed payments, refunds, cancellations, and account access issues.

## Session Roadmap

### Session 1: Commercial Roadmap And State Reconciliation

Progress target: 8 percent

Goal:

- Convert the current phase history into one commercial operating roadmap.
- Reconcile old reports with current repo truth.
- Set a stable continuation protocol for future sessions.

Deliverables:

- This roadmap.
- Current-state snapshot.
- Clear next-session entry point.

Status:

- Complete. Session 2 is the next entry point.

### Session 2: Release Gate And Risk Register

Progress target: 8 percent

Goal:

- Build one launch gate checklist that replaces scattered QA notes for commercialization decisions.

Work:

- Audit current public routes, protected routes, API endpoints, Supabase migrations, data-mode states, billing code, and demo state.
- Create a P0/P1/P2 risk register.
- Separate code blockers from operator setup blockers.

Exit criteria:

- A single `commercial-release-gate` document exists.
- Each blocker has owner type: code, Supabase, Vercel, Stripe, legal, operator, or customer validation.

Status:

- Complete. See `docs/product/commercial-release-gate-2026-06-16.md`.

### Session 3: Production Infrastructure Controls

Progress target: 8 percent

Goal:

- Make public traffic safer before larger cohorts.

Work:

- Configure or document Vercel Firewall/rate-limit rules for expensive endpoints.
- Confirm Supabase password protection options and document the current plan if leaked-password checks require a paid plan.
- Verify noindex behavior while still in early access.
- Confirm environment variable completeness for production and preview.

Exit criteria:

- Public AI endpoints are protected beyond in-memory best-effort limits.
- Production environment setup has a reproducible checklist.

Status:

- Documentation complete. See `docs/deployment/production-infrastructure-controls-2026-06-16.md` and `docs/deployment/vercel-firewall-cohort-rules.json`.
- Added `/api/health` and `docs/deployment/production-readiness-health-check-2026-06-16.md` so the operator can verify required production env readiness without exposing secrets.
- `/api/health` now includes auth redirect URLs derived from `VITE_APP_URL`; A6 QA runbook added at `docs/qa/auth-recovery-production-qa-2026-06-17.md`.
- Added `docs/qa/auth-recovery-contract-coverage-2026-06-17.md` and `npm run verify:auth-recovery`; `npm run check` now verifies auth routes, verification/reset redirects, OAuth destination constraints, login status messages, demo cleanup on auth completion, and `/api/health` auth redirect output.
- Added `docs/product/trust-boundary-contract-coverage-2026-06-17.md` and `npm run verify:trust-boundary`; `npm run check` now verifies public legal routes, legal copy, Settings boundaries, Ask Memoire, Daily Capture AI Assist, Quick Capture, Pipeline local-draft disclosure, and A8/R10 evidence links.
- Added `/api/client-log` and `docs/deployment/operator-monitoring-signals-2026-06-16.md` so failed client-side cloud sync can show up in serverless logs during cohort.
- Added `docs/deployment/production-readiness-contract-coverage-2026-06-17.md`, `docs/deployment/health-runtime-contract-coverage-2026-06-17.md`, `npm run verify:production-readiness`, and `npm run verify:health-runtime`; `npm run check` now verifies the `/api/health` and `/api/client-log` contracts plus the local `/api/health` response shape before production evidence is captured.
- Standardized app-level rate-limit 429 responses and documented the contract in `docs/deployment/app-rate-limit-contract-2026-06-17.md`.
- Added `docs/deployment/ai-endpoint-rate-limit-coverage-2026-06-17.md`, `docs/deployment/rate-limit-runtime-contract-coverage-2026-06-17.md`, `npm run verify:ai-rate-limits`, and `npm run verify:rate-limit-runtime`; `npm run check` now verifies the expensive AI/embedding routes still use the shared limiter before provider invocation and the shared helper still returns the documented local runtime 429/header/body behavior.
- Operational pass still requires applying and verifying Vercel/Supabase dashboard controls.

### Session 4: Two-Account Auth, RLS, And Data Isolation QA

Progress target: 8 percent

Goal:

- Prove that real user data does not cross accounts and demo data does not contaminate account mode.

Work:

- Run manual two-user QA on signup, login, Google OAuth, reset password, cloud writes, local cache ownership, export, deletion, and demo reset.
- Capture any RLS or sync regressions.

Exit criteria:

- A two-account QA report exists with evidence and unresolved issues.
- Any P0 isolation bug is fixed before continuing commercialization work.

Status:

- Static audit and QA protocol complete. See `docs/qa/two-account-data-isolation-qa-2026-06-16.md`.
- Export coverage fix completed in `api/export.ts`.
- Export integrity guard added in `api/export.ts` and documented in `docs/qa/export-integrity-guard-2026-06-16.md`; signed-in export now stops on cloud integrity or availability errors.
- Data-isolation contract coverage added at `docs/qa/data-isolation-contract-coverage-2026-06-17.md` and `docs/qa/data-isolation-runtime-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:data-isolation` and `npm run verify:data-isolation-runtime` for export owner checks, local runtime contamination proof, delete-account auth, demo cleanup, cloud JSON demo filtering, tombstones, owner markers, and cloud JSON RLS migration invariants.
- Operational pass still requires running the two-account matrix against protected production or preview.

### Session 5: First-Run Activation Hardening

Progress target: 8 percent

Goal:

- Make the first real user path feel obvious and complete.

Work:

- Review onboarding from signup to dashboard.
- Validate the three entry choices: import CSV, add one opportunity, or try demo.
- Ensure the first saved Pipeline Defense Brief or Review Pack is clearly recognized as activation.
- Remove or hide confusing secondary systems from first-run flow.

Exit criteria:

- A new user can reach a meaningful first review outcome without internal guidance.

Status:

- Static/product hardening complete. See `docs/product/first-run-activation-hardening-2026-06-16.md`.
- Empty-account dashboard now leads with Import CSV, Add Opportunity, and Try Demo.
- First pipeline review guide now loads cloud sales assets for signed-in users.
- Added `docs/product/activation-workflow-contract-coverage-2026-06-17.md`, `docs/product/cloud-json-runtime-contract-coverage-2026-06-17.md`, `npm run verify:activation-workflow`, and `npm run verify:cloud-json-runtime`; `npm run check` now verifies dashboard activation entry, opportunity import/add entry routes, Pipeline Defense Brief creation tracking, Review Pack save/load/return path, cloud JSON merge/owner runtime behavior, direct Review Pack route behavior, demo-local Review Pack boundaries, and trial checklist milestones.
- Operational proof still depends on the Session 4 two-account QA matrix.

### Session 6: Funnel Measurement And Operator Dashboard

Progress target: 8 percent

Goal:

- Turn early access into a measurable learning loop.

Work:

- Verify funnel events fire for demo start, demo completion, request access, signup, CSV import, and review-pack save.
- Add a lightweight internal view or SQL queries for lead and funnel review.
- Define weekly metrics for activation and conversion.

Exit criteria:

- The operator can answer: visitors, demo starts, demo completions, access requests, signups, first import, first review pack.

Status:

- Instrumentation and SQL-first operator dashboard complete. See `docs/product/funnel-measurement-operator-dashboard-2026-06-16.md`.
- Added `pipeline_defense_brief_created` event to cover the gap between CSV import and Review Pack save.
- Added service-role operator views and runnable query pack for daily funnel, anonymous progress, lead queue, and early-access status.
- Added early-access lead operations workflow: `supabase/migrations/20260616113000_early_access_operator_workflow.sql` and `docs/product/early-access-lead-operations-2026-06-16.md`.
- Added lead operations contract coverage at `docs/product/lead-operations-contract-coverage-2026-06-17.md` and `docs/product/lead-operations-runtime-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:lead-ops` and `npm run verify:lead-ops-runtime` for Request Access form, server insert, local payload normalization, privacy-minimized event path, private lead storage, operator workflow migrations, query pack, and runbook invariants.
- Production proof still requires applying the Supabase migration and checking live event rows after deployment.

### Session 7: Cohort Validation System

Progress target: 8 percent

Goal:

- Prepare Memoire for a limited early-access cohort instead of anonymous public selling.

Work:

- Create lead qualification criteria.
- Create interview script and feedback tracker.
- Define cohort size, invite sequence, support cadence, and stop/go criteria.
- Prepare outbound or manual follow-up templates.

Exit criteria:

- The first cohort can be invited and evaluated consistently.

Status:

- Cohort validation plan complete. See `docs/product/cohort-validation-system-2026-06-16.md`.
- Added cohort feedback tracker: `docs/product/cohort-feedback-tracker-2026-06-16.csv`.
- Added invite, onboarding, activation, closeout, and paid-intent outreach templates: `docs/product/cohort-outreach-templates-2026-06-16.md`.
- Added controlled-cohort release evidence packet: `docs/product/cohort-release-evidence-packet-2026-06-17.md`.
- Added `npm run verify:cohort` and included it in `npm run check` so the A1-A10 packet stays complete, defaults to HOLD, keeps noindex active, and keeps checkout inactive before cohort invite.
- Added `docs/product/cohort-support-contract-coverage-2026-06-17.md` and `npm run verify:support-cohort`; `npm run check` now verifies cohort qualification, outreach templates, feedback tracker fields, support runbook, in-app support package guidance, and weekly A9/C5 support review fields.
- 2026-07-01 controlled-cohort gate refresh added `docs/qa/controlled-cohort-gate-evidence-2026-07-01.md` and updated the cohort release packet with current static/local evidence. `verify:commercial`, `verify:cohort`, `verify:production-readiness`, `verify:health-runtime`, `verify:ai-rate-limits`, `verify:rate-limit-runtime`, `verify:data-isolation`, `verify:data-isolation-runtime`, `verify:auth-recovery`, `verify:trust-boundary`, `verify:lead-ops`, `verify:lead-ops-runtime`, `verify:support-cohort`, `verify:activation-workflow`, `verify:cloud-json-runtime`, `verify:commercial-operating-loop`, and `npm run build` passed locally. Cohort invite remains HOLD because production/protected-preview, two-account, demo-isolation, auth, monitoring, support-owner, and signed-in activation evidence is still missing.
- Later on 2026-07-01, `api/health.ts` was added and `npm run verify:health-runtime` was strengthened to invoke the real handler locally for GET, HEAD, 503, 405, `no-store`, and auth redirect output. `npm run typecheck:api`, `npm run verify:health-runtime`, and `npm run verify:production-readiness` passed after the change.
- The same 2026-07-01 follow-up added `api/client-log.ts` and strengthened `npm run verify:production-readiness` to invoke the real client-log handler locally for allowlisted operational events, arbitrary-event rejection, sanitized server-log JSON, quiet rate limiting, and `Memoire client operational event` log marker. `npm run typecheck:api`, `npm run verify:production-readiness`, and `npm run verify:accessibility-failure-state` passed after the change.
- Cohort invite remains blocked until Session 3 infrastructure evidence and Session 4 two-account QA evidence are complete or explicitly accepted as risks.

### Session 8: Core Workflow Reliability Pass

Progress target: 8 percent

Goal:

- Strengthen the real value workflow with less emphasis on public pages.

Work:

- Stress test Quick Capture -> Structure -> Today Actions -> Account Memory -> Ask Memoire.
- Test edge cases: duplicate captures, weak AI output, missing account, stale opportunity, browser reload, sync failure.
- Fix high-impact reliability issues.

Exit criteria:

- The V1 workflow is reliable enough for real user pipeline data under early-access terms.

Status:

- First reliability hardening pass complete. See `docs/product/core-workflow-reliability-pass-2026-06-16.md`.
- Review Pack return path now loads workspace-aware packs on Dashboard, Pipeline Defense, and direct Review Pack route.
- Demo-created Review Packs are now marked as sample artifacts and avoid cloud sync, reducing demo-to-account contamination risk before cohort QA.
- AI disclosure hardening added for Quick Capture and documented in `docs/product/ai-disclosure-boundary-hardening-2026-06-17.md`; Ask Memoire, Daily Capture AI Assist, Quick Capture, and Pipeline local-draft boundaries are now mapped for R10.
- Trust-boundary contract coverage added at `docs/product/trust-boundary-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:trust-boundary` so A8/R10 disclosure drift is caught before cohort signoff.
- Activation workflow contract coverage added at `docs/product/activation-workflow-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:activation-workflow` so A10 workflow drift is caught before signed-in QA evidence is captured.
- Build and local browser smoke checks passed.
- Full signed-in workflow QA remains pending and should be combined with Session 4 operational data isolation QA.

### Session 9: Pricing And Packaging Decision

Progress target: 8 percent

Goal:

- Move from pricing hypothesis to a testable paid offer.

Work:

- Synthesize cohort feedback and willingness-to-pay evidence.
- Decide initial package, price, trial model, refund policy, and plan limits.
- Update pricing page and product boundaries to match the selected offer.
- Validate whether the "Solo" package should say "individual salesperson" or "one person managing their own sales follow-up and pipeline memory" based on founder-led and solo-operator cohort evidence.

Exit criteria:

- There is one paid early-access offer, not a broad menu of uncertain plans.

### Session 10: Billing Enablement And Payment QA

Progress target: 8 percent

Goal:

- Safely turn on checkout for the selected paid offer.

Work:

- Configure Stripe price IDs.
- QA checkout, portal, cancellation, failed payment, success/cancel routes, and account plan status.
- Confirm billing endpoints are auth-protected and fail closed.
- Add operator runbook for billing support.

Exit criteria:

- A tester can subscribe and manage billing without developer intervention.

Status:

- Billing support runbook added at `docs/operations/billing-support-runbook-2026-06-17.md`.
- Billing payment QA protocol added at `docs/qa/billing-payment-qa-2026-06-17.md`.
- Checkout exposure guard added at `docs/deployment/billing-checkout-exposure-guard-2026-06-17.md`; Stripe keys and price IDs no longer enable checkout unless `BILLING_CHECKOUT_ENABLED=true`.
- Commercial readiness verification added at `scripts/verify-commercial-readiness.mjs` and included in `npm run check`; it now verifies checkout flag defaults, disabled-checkout backend behavior, noindex deploy headers, and inactive checkout copy/no checkout hook usage on landing and pricing surfaces.
- Billing paid-readiness contract coverage added at `docs/product/billing-paid-readiness-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:billing-paid-readiness` for `/api/billing`, `/api/stripe-webhook`, pricing hypothesis mode, B3 billing QA, B4 support runbook, and B1-B6 checkout exposure prerequisites.
- Checkout remains inactive. B3 and B4 still need selected offer, Stripe test-mode evidence, owners, refund/trial policy, and one test billing support case.

### Session 11: Public Selling Readiness

Progress target: 8 percent

Goal:

- Decide whether Memoire can move from controlled early access to broader public selling.

Work:

- Re-run release gate.
- Verify monitoring, legal, support, analytics, checkout, and data deletion.
- Review first paid conversion data and churn/refund signals.
- Decide whether to remove or relax noindex.

Exit criteria:

- Written go/no-go decision for public selling.

Status:

- Accessibility/failure-state QA protocol added at `docs/qa/accessibility-failure-state-qa-2026-06-17.md`.
- Accessibility/failure-state contract coverage added at `docs/qa/accessibility-failure-state-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:accessibility-failure-state`.
- App shell now includes a skip link/main landmark and mobile navigation can close with Escape.
- C6 remains open until the full keyboard, focus, modal, mobile, and slow/failure-state matrix passes on protected production or preview.

### Session 12: Commercial Operating Loop

Progress target: 8 percent

Goal:

- Move from launch project to operating cadence.

Work:

- Create weekly operating review: funnel, activation, revenue, support, errors, AI cost, customer feedback.
- Create backlog policy: which requests become product work, which stay manual, which are rejected.
- Define next commercial roadmap: growth, integrations, team workspace, or deeper individual workflow.

Exit criteria:

- Memoire has a repeatable commercial operating rhythm.

Status:

- Early-access support and incident runbook added at `docs/operations/early-access-support-incident-runbook-2026-06-17.md`.
- Settings -> Export & Delete now includes support-package guidance and the export README includes support data-handling guidance.
- Support/cohort contract coverage added at `docs/product/cohort-support-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:support-cohort` so A9/C5 support-process drift is caught before cohort signoff.
- C5 support process is partially satisfied, but operational evidence still requires confirming the inbox, naming primary/backup owners, and running one test support request.
- Weekly operating review template added at `docs/operations/weekly-operating-review-template-2026-06-17.md`.
- Commercial operating-loop contract coverage added at `docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md`; `npm run check` now includes `npm run verify:commercial-operating-loop`.
- R7 improves from missing query-pack evidence to static operating-loop coverage because the operator funnel SQL pack, weekly review template, monitoring runbook, and weekly review storage location are now checked together.
- C3 is guarded operating-loop ready, but operational evidence still requires saving one completed weekly review with real funnel, support, health, log, AI cost, and release-gate decisions.

## Current Blockers

P0 before unrestricted public traffic:

- Vercel or equivalent distributed rate limits for expensive AI endpoints.
- Deployed app-level 429 header proof on at least one expensive endpoint.
- Keep `npm run verify:ai-rate-limits` passing so app-level expensive-endpoint coverage does not drift while distributed controls are being evidenced.
- Keep `npm run verify:rate-limit-runtime` passing so the local helper 429/header/body contract does not drift before deployed endpoint proof is captured.
- Keep `npm run verify:production-readiness` passing so `/api/health` and `/api/client-log` contracts do not drift before production evidence is captured.
- Keep `npm run verify:health-runtime` passing so `/api/health` status, auth redirect, method, cache, and non-secret response behavior do not drift before deployed health evidence is captured.
- Keep `npm run verify:data-isolation` and `npm run verify:data-isolation-runtime` passing so export, deletion, demo cleanup, local contamination checks, and cloud JSON isolation contracts do not drift before two-account QA evidence is captured.
- Production `/api/health` evidence showing HTTP 200 and `ok: true`.
- Production auth recovery QA proving verification, reset password, and OAuth redirects on the deployed domain.
- Keep `npm run verify:auth-recovery` passing before using auth recovery QA as cohort evidence.
- Vercel log-filter evidence for `/api/client-log` events including cloud sync failures.
- Two-account QA for auth, RLS, sync, export, and deletion.
- Complete `docs/product/cohort-release-evidence-packet-2026-06-17.md` and keep decision at HOLD until A1-A4 and A7 are evidenced.
- Production monitoring for API errors, AI spend, auth failures, failed cloud writes, and lead submissions; keep `npm run verify:commercial-operating-loop` passing so the weekly operating loop remains aligned.
- Legal review for Privacy and Terms in the real selling jurisdiction.
- Keep `npm run verify:trust-boundary` passing before recording A8 as reviewed or accepted risk.
- Keep `npm run verify:activation-workflow` and `npm run verify:cloud-json-runtime` passing before using signed-in activation QA as cohort evidence.

P1 before paid checkout:

- Apply and evidence the lead follow-up workflow for `early_access_requests`.
- Keep `npm run verify:lead-ops` and `npm run verify:lead-ops-runtime` passing before using the Request Access queue as cohort evidence.
- Keep `npm run verify:support-cohort` passing before sending cohort invites or claiming C5 support readiness.
- Confirm product funnel event accuracy in production after applying the operator funnel migration.
- Confirm first-run activation path with real account data.
- Confirm deployed AI disclosure appears near AI-assisted features and matches configured provider behavior.
- Decide one paid early-access offer.
- Confirm whether founder-led sellers, consultants, freelancers, agency owners, or creators belong in the first paid offer, using `docs/product/solo-operator-persona-expansion-2026-07-01.md` as the scope boundary.
- Fill the billing support runbook with selected offer, price ID, owners, refund/trial policy, and one test support case.
- Run billing payment QA in Stripe test mode using `docs/qa/billing-payment-qa-2026-06-17.md`.
- Keep `BILLING_CHECKOUT_ENABLED=false` until B1-B6 pass.
- Keep `npm run verify:commercial` passing; changing landing/pricing into a paid checkout surface must be part of a signed B1-B6 paid-release update.
- Keep `npm run verify:billing-paid-readiness` passing until the signed B1-B6 paid-checkout release updates the billing, pricing, support, QA, and legal evidence together.

P2 before broader scale:

- Data consolidation for legacy/current schema coexistence.
- RLS performance tuning.
- Indexes for actively queried foreign keys.
- Complete the first weekly operating review using `docs/operations/weekly-operating-review-template-2026-06-17.md` and save it under `docs/operations/weekly-reviews/`.
- Confirm support inbox owner, backup owner, first test support request, and SEV0/SEV1 escalation evidence.
- Keep `npm run verify:accessibility-failure-state` passing, then complete the accessibility pass for keyboard navigation, focus order, modal behavior, mobile navigation, and slow/failure states using `docs/qa/accessibility-failure-state-qa-2026-06-17.md`.
- Change-email self-service.

## Continuation Protocol

At the start of each future session:

1. Read this roadmap first.
2. Check `git status --short`.
3. Read the newest relevant phase report or QA report.
4. If the work concerns first cohort invite, read `docs/product/cohort-release-evidence-packet-2026-06-17.md` and update evidence there.
5. Identify the current session number and target progress.
6. Advance only one coherent 5-10 percent slice unless the user asks otherwise.

At the end of each future session:

1. Update or create a phase report.
2. Record verification status.
3. Mark which roadmap session moved forward.
4. Name the next best session entry point.

## Next Best Session

Session 3/4 operational gates should run next through `docs/product/cohort-release-evidence-packet-2026-06-17.md` and `docs/qa/controlled-cohort-gate-evidence-2026-07-01.md` to unlock the controlled cohort. Session 8 reliability can continue only where it directly supports signed-in activation QA. Session 9 pricing should wait for cohort evidence.

The first concrete reliability question:

Can a real cohort user import or create pipeline data, create a Pipeline Defense Brief, save a Review Pack, return later, and trust that the data is still correct?

The unresolved launch-gate question from Session 4:

Can two separate signed-in users create, sync, export, and delete realistic pipeline data without seeing or resurrecting each other's records, and without demo data leaking into account mode?
