# Phase M.38 — Stakeholder Graph QA Checklist

## Demo sandbox

- Clear localStorage.
- Open Dashboard.
- Open Demo Sandbox.
- Confirm DataModePill shows Demo local.
- Open `/app/stakeholders`.
- Confirm sample stakeholders appear:
  - Dr. Avery
  - Ms. Morgan
  - Mr. Taylor
  - Procurement contact
  - QA manager

## Stakeholder CRUD

- Add a stakeholder:
  - Name: Mr. Quan
  - Account: Orion Pharma
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
- Open Apex Labs account detail.
- Confirm stakeholder section appears.
- Confirm Dr. Avery and Ms. Morgan appear under Apex Labs.
- Click Open Stakeholders.
- Confirm Stakeholders page opens with account context.

## Opportunity integration

- Open `/app/opportunities`.
- Open Apex Labs / Validation Expansion.
- Confirm Stakeholder Map appears.
- Confirm champion/technical buyer is visible.
- Open Orion Pharma / Procurement review.
- Confirm stakeholder coverage warnings appear where relevant.

## Capture integration

- Open `/app/capture`.
- Capture:
  `Met with Dr. Avery at Apex Labs today. She supports Validation Expansion and asked us to follow up with procurement.`
- Save activity.
- Confirm the app suggests creating a stakeholder from Dr. Avery if not already present.
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
