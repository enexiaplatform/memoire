# Phase M.30 Regression Summary

## What Was Reviewed

- First-run onboarding flow and sample-data behavior.
- Dashboard data loading from activities, opportunities, accounts, and pipeline defense briefs.
- Daily Capture activity creation, local/cloud persistence, and opportunity linking.
- Calendar period views, activity detail, link/unlink behavior, and source labels.
- Weekly/monthly Reviews recap generation and copy behavior.
- Account Memory aggregation from opportunities and linked/matching activities.
- Opportunities CRUD, quality summary, linked activity timeline, and defense brief generation.
- Pipeline Defense brief creation, review mode, readiness/action panels, export, and print.
- localStorage fallback and Supabase cloud data path naming conventions.

## What Was Fixed

- Calendar summaries now count linked account and linked opportunity names when an activity has been linked to an opportunity.
- Calendar copied summaries now prefer linked account/opportunity context.
- Weekly/monthly recaps now prefer linked account names in accounts touched, top accounts, open next actions, objections, and follow-ups.
- Calendar and Reviews source labels now state whether the user is in cloud sync, local mode, or cloud-unavailable fallback.

## Known Limitations

- Sample data is intentionally local-only. When signed in, it updates the Dashboard view immediately but does not write sample records into Supabase.
- Deleting an opportunity does not destructively rewrite historical activity notes. Linked activity records may still preserve the previous linked account/opportunity names for history.
- Onboarding state is browser-local only and does not sync across devices.
- Cloud mode requires Supabase SQL migrations and Vercel/local env vars to be configured outside the app.
- No real AI, Gmail, Google Calendar, Salesforce, HubSpot, or external CRM integrations exist.

## Recommended Manual QA Before Inviting Users

- Run the full checklist in `docs/qa/phase-m30-end-to-end-data-flow-checklist.md`.
- Test once logged out with no Supabase env vars.
- Test once logged in after running all Supabase SQL migrations.
- Test direct route refresh for all app routes after deployment.
- Verify Vercel access protection/private deployment settings before entering real customer data.
- Confirm print/export on Pipeline Defense with both generated and manually edited briefs.
