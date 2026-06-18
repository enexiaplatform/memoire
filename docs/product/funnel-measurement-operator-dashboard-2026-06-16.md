# Memoire Funnel Measurement And Operator Dashboard

Date: 2026-06-16

Roadmap session: Session 6 - Funnel Measurement And Operator Dashboard

## Decision

Memoire now has a measurable early-access activation funnel for the controlled cohort stage.

This is not a full analytics product. It is a privacy-minimized operator loop that answers the commercialization questions needed before cohort invite:

- How many visitors started the demo?
- How many completed the demo?
- How many requested access?
- How many signed up?
- How many imported or refreshed a CSV?
- How many created a Pipeline Defense Brief?
- How many saved a Review Pack?

## Instrumentation Map

| Funnel milestone | Event | Source |
| --- | --- | --- |
| Demo started | `demo_started` | `src/features/demo/DemoEntryPage.tsx` |
| Demo completed | `demo_completed` | `src/utils/demoJourney.ts` |
| Request access submitted | `request_access_submitted` | `src/features/earlyAccess/EarlyAccessRequestPage.tsx` |
| Signup completed | `signup_completed` | `src/features/auth/SignupPage.tsx` |
| CSV import or refresh completed | `csv_import_completed` | `src/features/opportunities/OpportunitiesPage.tsx` |
| Pipeline Defense Brief created | `pipeline_defense_brief_created` | `src/features/opportunities/OpportunitiesPage.tsx`, `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx` |
| Review Pack saved | `review_pack_saved` | `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx` |

## What Changed

### First Brief Event

Added `pipeline_defense_brief_created` to the product funnel event contract.

Updated:

- `src/utils/productAnalytics.ts`
- `api/request-access.ts`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

This closes the measurement gap between importing a pipeline and saving a Review Pack.

### Data Mode Accuracy

Updated Opportunities analytics so demo-workspace CSV import, refresh, and brief creation are recorded as `demo-local` instead of falling through to `browser-only`.

This keeps operator reporting from mixing demo behavior with real browser-only or signed-in activation.

### Operator Views

Added Supabase migration:

- `supabase/migrations/20260616103000_operator_funnel_measurement.sql`

It creates:

- `public.operator_funnel_daily`
- `public.operator_funnel_anonymous_progress`
- `public.operator_early_access_daily`
- `public.operator_early_access_queue` after the lead operations hardening pass

The views are intended for service-role/operator access only. They expose counts and anonymous milestone timestamps, not sales content.

### Operator Query Pack

Added runnable operator queries:

- `docs/product/operator-funnel-queries-2026-06-16.sql`

The query pack covers:

- 30-day daily funnel scoreboard.
- Last 7 days activation snapshot.
- Anonymous journey progress.
- New lead follow-up queue.
- Early-access status trend.
- Lead owner, due date, contacted/decision timestamps, and retention review queries after the lead operations hardening pass.

### Lead Operations Hardening

Added:

- `supabase/migrations/20260616113000_early_access_operator_workflow.sql`
- `docs/product/early-access-lead-operations-2026-06-16.md`

This turns early-access requests into an operator-owned queue with:

- `operator_owner`
- `follow_up_due_at`
- `contacted_at`
- `decided_at`
- `operator_note`
- `status_updated_at`
- overdue follow-up counts in `operator_early_access_daily`

## Privacy Boundary

`product_funnel_events` remains privacy-minimized:

- No email.
- No sales content.
- No account names.
- No opportunity names.
- No CRM data.
- No free-form user text.

Lead contact details remain only in `early_access_requests`, which is private and service-role-only.

## Verification

Static verification completed:

- Confirmed all allowed product event names are accepted by `api/request-access.ts`.
- Confirmed all frontend event names are represented in `ProductFunnelEvent`.
- Confirmed route-level sources exist for demo, signup, request access, CSV import, brief creation, and Review Pack save.

Automated verification is tracked in the session output.

Automated verification:

- `npm run build` passed.
- `npm run typecheck:api` passed.

## Remaining Risks

- The migration must be applied to the production Supabase project before the new `pipeline_defense_brief_created` event is persisted.
- The operator query pack is SQL-first, not an in-app admin UI.
- Anonymous funnel events cannot be directly joined to lead emails by design.
- Signup completion currently means the signup request succeeded and the user was routed to email verification; production email verification still needs operational QA.
- Session 4 two-account QA and Session 3 infrastructure controls remain required before inviting a cohort.

## Next Recommended Session

Proceed to Session 7: Cohort Validation System.

Focus:

- Define first cohort size and qualification criteria.
- Create invite and follow-up cadence.
- Create interview script and feedback tracker.
- Define stop/go thresholds using the funnel metrics from this session.
