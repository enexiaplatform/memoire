# Phase M.38 — Stakeholder Graph Report

## Files created

- `src/services/stakeholderStore.ts`
- `src/utils/stakeholderGraph.ts`
- `src/features/stakeholders/StakeholdersPage.tsx`
- `docs/database/supabase-stakeholders-schema.sql`
- `docs/qa/phase-m38-stakeholder-graph-checklist.md`
- `docs/briefs/phase-m38-stakeholder-graph-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/features/accounts/AccountsPage.tsx`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/utils/sampleData.ts`

## Data model

Added a personal-user stakeholder model with account/opportunity context, role, influence, relationship strength, stance, contact details, notes, tags, and last interaction date.

Supported stakeholder roles:

- Champion
- Economic buyer
- Technical buyer
- User
- Procurement
- Decision maker
- Influencer
- Blocker
- Legal / QA / Compliance
- Unknown

## Local/cloud behavior

Stakeholders use `memoire.stakeholders.v1` in local mode.

When a user is signed in and Supabase is configured, stakeholders save to `public.stakeholders`. If cloud save fails, the app preserves a local copy and shows the unified sync issue copy.

Demo sandbox stakeholders remain local-only and do not sync to Supabase.

## Account/opportunity/capture integration

Accounts now show related stakeholders in the account detail panel.

Opportunities now show a Stakeholder Map with coverage warnings such as missing champion, economic buyer unknown, procurement not mapped, and blocker/resistant stakeholder exists.

Daily Capture now suggests creating a stakeholder when an activity contains an extracted contact or stakeholder name. Creation is user-confirmed only.

## Demo data changes

Demo sandbox now includes realistic stakeholders:

- Dr. Avery — Apex Labs — Champion / Technical buyer / Supportive
- Ms. Morgan — Apex Labs procurement — Procurement / Neutral
- Mr. Taylor — Northstar Foods — Technical buyer / Developing
- Procurement contact — Orion Pharma — Procurement / Unknown
- QA manager — Summit Diagnostics — User / Neutral

Incumbent Vendor remains competitor context, not a stakeholder.

## What remains intentionally not built

- No Gmail integration
- No Google Calendar integration
- No Salesforce/HubSpot sync
- No real AI changes
- No team workspace stakeholder sharing
- No complex node-link graph visualization
- No automatic stakeholder creation without user confirmation

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing hook dependency warnings.
