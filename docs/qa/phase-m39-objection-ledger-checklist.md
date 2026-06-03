# Phase M.39 — Objection Ledger QA Checklist

## Demo sandbox

- Clear localStorage.
- Open Dashboard.
- Open Demo Sandbox.
- Confirm DataModePill shows Demo local.
- Open `/app/objections`.
- Confirm sample objections appear:
  - Northstar Foods lead time
  - Apex Labs documentation / validation proof
  - Orion Pharma procurement / tender uncertainty
  - Summit Diagnostics local support
  - Incumbent Vendor competitor pressure

## Objection CRUD

- Add objection:
  - Account: Northstar Foods
  - Opportunity: Lab workflow
  - Type: Lead time
  - Impact: High
  - Status: Open
  - Text: Customer is concerned delivery may not meet project timeline.
- Refresh.
- Confirm objection persists.
- Edit status to Addressed or Resolved.
- Delete objection.
- Confirm it is removed.

## Opportunity integration

- Open `/app/opportunities`.
- Open Northstar Foods / Lab workflow.
- Confirm Objection Ledger section appears.
- Confirm linked objections are visible.
- Confirm warning appears for high-impact open objection when present.

## Account integration

- Open `/app/accounts`.
- Open Northstar Foods account detail.
- Confirm Account Objections section appears.
- Confirm open/resolved counts and objection rows display.

## Capture integration

- Open `/app/capture`.
- Capture:
  `Northstar Foods is still worried about lead time and wants local proof before moving forward.`
- Save activity.
- Confirm app suggests creating objection.
- Create objection.
- Confirm it appears in `/app/objections`.
- Confirm no objection is created automatically without confirmation.

## Pipeline Defense integration

- Open `/app/opportunities`.
- Generate Pipeline Defense Brief from Northstar Foods opportunity.
- Open `/app/pipeline-defense`.
- Confirm generated deal objection debt includes open structured objection context.

## Dashboard integration

- Open Dashboard.
- Confirm Open Objection Signals appears when open objections exist.
- Confirm high-impact open objections are prioritized.

## Local and cloud modes

- Test logged-out localStorage mode.
- Refresh and confirm objections persist locally.
- Sign in after running `docs/database/supabase-objections-schema.sql`.
- Add/edit/delete an objection.
- Refresh and confirm objection persists from Supabase.
- Confirm demo sandbox objections remain local-only.

## Regression checks

- `/app/dashboard` still works.
- `/app/capture` still works.
- `/app/calendar` still works.
- `/app/reviews` still works.
- `/app/accounts` still works.
- `/app/opportunities` still works.
- `/app/stakeholders` still works.
- `/app/pipeline-defense` still works.
- No Gmail, Google Calendar, Salesforce/HubSpot, or external CRM integration was added.

## Verification

- Run `npm run build`.
- Run `npm run lint`.
