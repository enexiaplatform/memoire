# Pre-Deploy Hardening Checklist

- [ ] Build passes.
- [ ] Lint status is known and documented.
- [ ] Direct route refresh works for `/app/pipeline-defense`.
- [ ] Sidebar route for Pipeline Defense is visible.
- [ ] localStorage warning banner is visible.
- [ ] Print hides controls, warning banner, edit UI, and app-only panels.
- [ ] Export Brief works.
- [ ] Pipeline Defense has no network/API integration.
- [ ] Legacy routes have been reviewed.
- [ ] Vercel SPA fallback exists.
- [ ] Bundle warning has been reviewed.
- [ ] Deployment access protection has been decided before sharing.

## Recommended Final Smoke Test

- [ ] Open the deployed app.
- [ ] Navigate to `/app/pipeline-defense`.
- [ ] Refresh the direct route.
- [ ] Create or select a brief.
- [ ] Edit metadata and one deal.
- [ ] Refresh and confirm local persistence in the same browser.
- [ ] Analyze Deal Risks.
- [ ] Check Review Readiness.
- [ ] Generate This Week's Actions.
- [ ] Enter and exit Review Mode.
- [ ] Export Brief.
- [ ] Print / Save PDF.
- [ ] Confirm browser print output is clean.
- [ ] Confirm no confidential customer data is entered during internal testing.
