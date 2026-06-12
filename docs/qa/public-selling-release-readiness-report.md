# Memoire Public-Selling Release Readiness

Audit date: 2026-06-12

## Decision

**Ready for controlled early-access testing after deployment.**

**Not ready for unrestricted public selling yet.**

The core product builds cleanly, production dependencies have no known npm
vulnerabilities, primary routes resolve, and the main cloud tables use RLS.
The remaining release blockers are infrastructure and operational controls,
not missing product modules.

## Code hardening completed

- Added authentication checks to paid or privileged API routes.
- Prevented the browser from sending Capture AI API keys.
- Added input limits to AI/search endpoints.
- Made Stripe checkout accept only configured price IDs.
- Made billing endpoints fail closed when Stripe is not configured.
- Removed billing controls from Settings while checkout is inactive.
- Added working Privacy, Terms, and Product Boundaries pages.
- Added a complete local workspace export and a broader cloud export.
- Fixed email signup to route to email verification.
- Added AI-provider privacy disclosure to Ask Memoire.
- Added `npm run typecheck:api` and `npm run check`.
- Updated vulnerable transitive dependencies.

## Verification completed

- `npm run check`: pass.
- Frontend production build: pass.
- Vercel API TypeScript check: pass.
- ESLint: 0 errors, 5 known legacy hook warnings.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: pass.
- Production preview returned HTTP 200 for all audited public and app routes.
- Main application bundle remains route-split; no Vite large-chunk warning.
- Browser QA passed on desktop and 390 px for the landing page, demo,
  request-access, dashboard, accounts, and opportunities.
- Accounts and Opportunities keep wide master tables inside their own
  horizontal scroll containers; the application viewport no longer overflows.
- Request Access submit, local persistence after refresh, Copy Request Summary,
  and Validation Feedback Copy All were verified with non-confidential QA data.
- No browser console errors were observed on the audited routes.

Audited routes include:

- `/`, `/login`, `/signup`, `/verify-email`, `/pricing`, `/demo`
- `/request-access`, `/legal/privacy`, `/legal/terms`, `/legal/boundaries`
- Dashboard, Capture, Calendar, Reviews, Accounts, Opportunities
- Stakeholders, Objections, Playbook, Assets, Pipeline Defense, Settings

## Live Supabase findings

Positive:

- All existing public tables have RLS enabled.
- Policies constrain rows with `auth.uid()` against the row owner.
- No missing-RLS security advisory was reported.

Production schema migrations applied and verified on 2026-06-12:

1. `docs/database/supabase-accounts-master-code-migration.sql`
2. `docs/database/supabase-stakeholders-schema.sql`
3. `docs/database/supabase-objections-ledger-migration.sql`
4. `docs/database/supabase-sales-activities-extraction-v2-migration.sql`

Verification confirmed:

- All 19 existing accounts received per-user account codes.
- Stakeholders exists with RLS and four authenticated CRUD policies.
- Objection Ledger columns exist and seven legacy rows were preserved/backfilled.
- Capture Extraction v2 columns exist.
- Existing account, opportunity, activity, objection, and brief row counts were
  preserved through the additive migrations.

Legacy and current columns still coexist in `accounts`, `opportunities`, and
`objections`. This is deliberate backward compatibility and should be removed
only through a separately tested data-consolidation phase.

Supabase security advisories:

- Move the `vector` extension out of `public`:
  https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Enable leaked-password protection:
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance advisories are not launch blockers at current volume, but should
be scheduled before scale:

- Replace repeated `auth.uid()` policy calls with `(select auth.uid())`.
- Remove duplicate permissive policies on `accounts` and `opportunities`.
- Add indexes for actively queried foreign keys after validating query usage.

## Public-selling blockers

1. Add Vercel Firewall rate-limit rules for paid AI endpoints:
   `/api/ask-memoire`, `/api/search`, `/api/structure-capture`,
   `/api/capture-ai-classify`, and `/api/generate-embedding`.
   Application-level best-effort limits are present, but distributed firewall
   enforcement is still required for unrestricted public traffic.
2. Enable leaked-password protection in Supabase Auth.
3. Complete authenticated two-user QA, including Google OAuth and RLS isolation.
4. Have Privacy and Terms reviewed for the actual selling jurisdictions and
   business entity. Current pages are product-ready copy, not legal advice.
5. Configure production monitoring for API error rate, AI spend, auth failures,
   and failed cloud writes.

## UX assessment

Strengths:

- Primary navigation is reduced to Workspace and Review; secondary modules are
  collapsed under More tools.
- Dashboard starts with a concrete first action.
- Data mode language distinguishes synced, local-only, sync issue, and demo.
- Accounts and Opportunities use dense master-table layouts suitable for scale.
- Demo data is local-only and visually identified.

Remaining authenticated/manual UX checks:

- New-user flow: landing to signup, email verification, login, dashboard.
- Google OAuth callback on the production domain.
- Sign-out returns to the public landing page.
- Keyboard navigation, focus order, modal escape/close, and copy feedback.
- Empty/loading/error states with slow or unavailable Supabase.
- Data export and account deletion with realistic cloud data.

## Recommended release sequence

1. Deploy the audited code to a preview environment.
2. Configure Supabase password protection and Vercel rate limits.
3. Run the manual critical-path checklist with two separate user accounts.
4. Invite a limited cohort under “early access” positioning.
5. Review errors, cloud-sync failures, and AI cost after the first test cohort.
6. Open unrestricted public signup only after the cohort has no P0/P1 failures.
