# Phase M.39 — Objection Ledger Report

## Files created

- `src/services/objectionStore.ts`
- `src/utils/objectionLedger.ts`
- `src/features/objections/ObjectionsPage.tsx`
- `docs/database/supabase-objections-schema.sql`
- `docs/qa/phase-m39-objection-ledger-checklist.md`
- `docs/briefs/phase-m39-objection-ledger-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/features/accounts/AccountsPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/utils/opportunityQuality.ts`
- `src/utils/opportunityToPipelineBrief.ts`
- `src/utils/sampleData.ts`

## Data model

Added structured objections with account/opportunity/stakeholder/activity links, type, impact, status, proof required, response plan, resolution note, due date, resolved timestamp, and tags.

Supported objection types:

- Price
- Lead time
- Technical fit
- Documentation
- Local support
- Compliance / validation
- Competitor
- Budget
- Procurement
- Timing
- Trust / relationship
- Other

Supported statuses:

- Open
- Addressed
- Resolved
- Parked

## Local/cloud behavior

Objections use `memoire.objections.v1` in local mode.

When signed in and Supabase is configured, objections save to `public.objections`. If cloud save fails, Memoire preserves a local copy and shows the unified sync issue copy.

Demo sandbox objections remain local-only and are not synced to Supabase.

## Integrations

Capture:

- Detects objection candidates from risk, competitor, procurement, support, validation, documentation, lead-time, and proof signals.
- Suggests creating an objection after saving an activity.
- Does not auto-create objections without confirmation.

Opportunities:

- Detail panel now shows an Objection Ledger section.
- Shows open/addressed/resolved counts and warnings for high-impact, competitor, and compliance/documentation objections.
- Pipeline quality counts open ledger objections in addition to legacy `objectionDebt` text.
- Pipeline Defense Brief generation merges open ledger objections into deal objection debt.

Accounts:

- Account detail now shows Account Objections with open/resolved counts and common objection type.

Dashboard:

- Shows a concise Open Objection Signals panel when open objections exist, prioritizing high-impact objections.

Reviews:

- Shows concise objection movement for the selected week/month when ledger objections were created or resolved in that period.

## Demo data changes

Demo sandbox now includes realistic mixed objections:

- Control Union — Lead time concern — Open — Medium
- VHP — Compliance / validation proof — Addressed — Medium
- TV Pharm — Procurement/tender uncertainty — Open — High
- Bidiphar — Local support concern — Open — Medium
- VHP / STERIS — Competitor pressure — Addressed — Medium

## What remains intentionally not built

- No Gmail integration
- No Google Calendar integration
- No Salesforce/HubSpot sync
- No real AI changes
- No team objection workflow
- No automatic objection creation without user confirmation
- No complex objection ownership/escalation system

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing hook dependency warnings.
