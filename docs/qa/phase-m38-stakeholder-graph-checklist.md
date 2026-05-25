# Phase M.38 — Stakeholder Graph QA Checklist

## Demo sandbox

- Clear localStorage.
- Open Dashboard.
- Open Demo Sandbox.
- Confirm DataModePill shows Demo local.
- Open `/app/stakeholders`.
- Confirm sample stakeholders appear:
  - Dr. Linh
  - Ms. An
  - Mr. Minh
  - Procurement contact
  - QA manager

## Stakeholder CRUD

- Add a stakeholder:
  - Name: Mr. Quan
  - Account: TV Pharm
  - Role: Economic buyer
  - Influence: High
  - Stance: Neutral
- Edit role, influence, stance, tags, and notes.
- Refresh the page.
- Confirm stakeholder persists.
- Delete stakeholder.
- Confirm it is removed.

## Account integration

- Open `/app/accounts`.
- Open VHP account detail.
- Confirm stakeholder section appears.
- Confirm Dr. Linh and Ms. An appear under VHP.
- Click Open Stakeholders.
- Confirm Stakeholders page opens with account context.

## Opportunity integration

- Open `/app/opportunities`.
- Open VHP / SolidFog EU-GMP Phase 2.
- Confirm Stakeholder Map appears.
- Confirm champion/technical buyer is visible.
- Open TV Pharm / Tender opportunity.
- Confirm stakeholder coverage warnings appear where relevant.

## Capture integration

- Open `/app/capture`.
- Capture:
  `Met with Dr. Linh at VHP today. She supports SolidFog Phase 2 and asked us to follow up with procurement.`
- Save activity.
- Confirm the app suggests creating a stakeholder from Dr. Linh if not already present.
- Create or ignore the stakeholder.
- Confirm no stakeholder is created automatically without confirmation.

## Local and cloud modes

- Test logged-out localStorage mode.
- Refresh and confirm stakeholders persist locally.
- Sign in after running `docs/database/supabase-stakeholders-schema.sql`.
- Add/edit/delete a stakeholder.
- Refresh and confirm stakeholder persists from Supabase.
- Confirm demo sandbox stakeholders remain local-only.

## Regression checks

- `/app/dashboard` still works.
- `/app/capture` still works.
- `/app/calendar` still works.
- `/app/reviews` still works.
- `/app/accounts` still works.
- `/app/opportunities` still works.
- `/app/pipeline-defense` still works.
- No Gmail, Google Calendar, Salesforce/HubSpot, or external CRM integration was added.

## Verification

- Run `npm run build`.
- Run `npm run lint`.
