# Phase M.30 End-to-End Data Flow Checklist

This checklist verifies the full Personal B2B Sales OS journey from first-run onboarding to pipeline defense output.

## A. First-Run Onboarding

- Clear local onboarding key: `memoire.onboarding.v1`.
- Open `/app/dashboard`.
- Verify the Welcome to Memoire panel appears.
- Verify onboarding steps show:
  - Capture your first sales activity
  - Add your first opportunity
  - Create or confirm an account memory
  - Review your dashboard
  - Generate your first pipeline defense brief
- Click each CTA and confirm it navigates to the expected module.
- Return to `/app/dashboard`.
- In logged-out/local mode, click `Open Demo Sandbox`.
- Verify sample activities appear in `/app/capture`.
- Verify sample activities appear in `/app/calendar`.
- Verify sample activities contribute to `/app/reviews`.
- Verify sample opportunities appear in `/app/opportunities`.
- Verify sample account appears in `/app/accounts`.
- Verify sample defense brief appears in `/app/pipeline-defense`.
- Dismiss the guide and refresh.
- Verify the guide stays dismissed.
- Reset the guide and refresh.
- Verify the guide appears again.

Note: sample data is intentionally local-only. When signed in, cloud records are not changed.

## B. Manual Sales Flow

- Open `/app/opportunities`.
- Add an opportunity:
  - Account: `Northstar Foods`
  - Opportunity: `Lab workflow`
  - Stage: `Technical discussion`
  - Forecast evidence: `Weak but recoverable`
  - Decision recommendation: `Rescue`
  - Next action: `Send local support proof`
- Open `/app/capture`.
- Capture: `Gặp Northstar Foods, họ còn lăn tăn lead time. Cần gửi proof local support tuần này.`
- Verify the activity classifies into a structured record.
- Link the activity to `Northstar Foods / Lab workflow`.
- Open `/app/accounts`.
- If Northstar Foods is only a candidate, create account from candidate.
- Open Northstar Foods account memory.
- Verify the related opportunity appears.
- Verify the linked activity appears in the timeline.
- Verify open next action and objection/risk signals appear where applicable.
- Open `/app/dashboard`.
- Verify recent activity, priority actions, at-risk opportunities, and accounts needing touch update.
- Open `/app/calendar`.
- Verify the activity appears on the selected date.
- Open `/app/reviews`.
- Generate a weekly recap and verify the activity contributes to account, follow-up, objection, and next-action sections.

## C. Pipeline Defense Flow

- Open `/app/opportunities`.
- Select one or more opportunities.
- Click `Generate Defense Brief`.
- Verify preview opens and mapped deal fields are populated.
- Click `Create Brief`.
- Verify the app navigates to `/app/pipeline-defense`.
- Verify the new brief is active.
- Enter Review Mode.
- Confirm compact review content renders.
- Click `Check Review Readiness`.
- Confirm quality panel updates.
- Click `Generate This Week's Actions`.
- Confirm action plan appears.
- Click `Export Brief`.
- Confirm Markdown export still works.
- Click `Print / Save PDF`.
- Confirm print view hides controls and remains readable.

## D. Local Mode

- Sign out or use an environment without Supabase env vars.
- Open `/app/dashboard`.
- Confirm local mode messaging is visible.
- Create account, opportunity, activity, and pipeline defense brief.
- Refresh the browser.
- Verify local data persists.
- Confirm records show local storage labels where applicable.

## E. Cloud Mode

- Sign in with Google after Supabase env vars and SQL migrations are configured.
- Confirm cloud sync messaging appears.
- Create an account, opportunity, activity, and pipeline defense brief.
- Refresh.
- Verify data reloads.
- Sign out and sign back in.
- Verify cloud data reloads.
- Test in another browser/profile and verify signed-in data appears.

## F. Cross-Module Deletion

- Delete a linked activity.
- Verify it disappears from `/app/calendar`.
- Verify it no longer appears in `/app/reviews`.
- Verify account detail no longer shows it in linked activities.
- Delete an opportunity.
- Verify `/app/dashboard` no longer counts it as an active opportunity.
- Verify `/app/accounts` does not crash and still shows account profile/activity memory.
- Verify pipeline defense generation handles the missing opportunity.
- Delete an account.
- Verify opportunities remain intact.
- Verify account candidate can reappear from remaining opportunities/activities.

## G. Empty States

- Test with no activities.
- Verify `/app/capture`, `/app/calendar`, and `/app/reviews` show clear empty states and links to capture.
- Test with no opportunities.
- Verify `/app/opportunities` and activity linking empty states suggest adding an opportunity.
- Test with no accounts.
- Verify `/app/accounts` suggests adding an account or creating one from opportunities/activities.
- Test with no pipeline defense briefs.
- Verify `/app/pipeline-defense` remains usable and can create/import/generate a brief.
- Test Dashboard with no data.
- Verify it prompts the user to capture activity or add opportunity.

## H. No External Integrations

- Search implementation for new Gmail, Google Calendar, Salesforce, HubSpot, external CRM, or real AI integrations.
- Confirm Daily Capture remains rule-based.
- Confirm Calendar is not connected to Google Calendar.
- Confirm Reviews are deterministic and local/cloud data-backed.
- Confirm Opportunity and Account modules use localStorage/Supabase only.
- Confirm Draft Assist remains local mock/provider abstraction only.
