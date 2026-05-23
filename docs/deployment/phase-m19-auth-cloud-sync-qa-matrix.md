# Phase M.19 Auth + Cloud Sync QA Matrix

## A. Logged-Out Mode

- [ ] Open app with no Supabase env vars.
- [ ] Navigate to `/app/pipeline-defense`.
- [ ] Create a brief.
- [ ] Edit a deal.
- [ ] Refresh.
- [ ] Confirm local data persists.

Expected: app does not require login, uses localStorage, and shows a sign-in/cloud sync note.

## B. Missing Env Vars

- [ ] Remove or leave blank `VITE_SUPABASE_URL`.
- [ ] Remove or leave blank `VITE_SUPABASE_ANON_KEY`.
- [ ] Restart dev server.
- [ ] Open `/app/pipeline-defense`.
- [ ] Confirm app does not crash.
- [ ] Confirm local mode still works.
- [ ] Click `Sign in with Google`.
- [ ] Confirm unavailable/graceful error appears.

Expected: no crash, no credential leak, localStorage workflow preserved.

## C. Logged-In Mode

- [ ] Configure Supabase env vars.
- [ ] Enable Google provider.
- [ ] Run SQL schema.
- [ ] Click `Sign in with Google`.
- [ ] Complete OAuth.
- [ ] Confirm return to `/app/pipeline-defense`.
- [ ] Confirm user email/name appears.
- [ ] Confirm cloud sync enabled.
- [ ] Create a brief.
- [ ] Edit brief metadata and one deal.
- [ ] Refresh.
- [ ] Confirm data persists from cloud.

Expected: signed-in data loads from `pipeline_defense_briefs` and saves to Supabase.

## D. Cross-Browser/Device

- [ ] Sign in on Browser A.
- [ ] Create a cloud brief.
- [ ] Edit one deal.
- [ ] Sign in on Browser B with the same Google account.
- [ ] Confirm the brief loads.

Expected: same user's cloud briefs appear across browsers/devices.

## E. Local-To-Cloud Migration

- [ ] Sign out.
- [ ] Create a local brief.
- [ ] Refresh and confirm it persists locally.
- [ ] Sign in.
- [ ] Confirm migration prompt appears.
- [ ] Click `Sync local briefs`.
- [ ] Confirm cloud brief appears.
- [ ] Refresh.
- [ ] Confirm migrated brief persists.

Expected: local briefs upload to cloud without blindly overwriting existing cloud briefs.

## F. RLS Isolation

- [ ] User A signs in.
- [ ] User A creates a brief.
- [ ] User A signs out.
- [ ] User B signs in.
- [ ] Confirm User B cannot see User A's brief.
- [ ] In Supabase table editor, confirm both rows have different `user_id` values.

Expected: RLS isolates users with `auth.uid() = user_id`.

## G. CRUD And Existing MVP Workflows

- [ ] Create brief.
- [ ] Update brief title/week/sales owner/scope.
- [ ] Duplicate brief.
- [ ] Delete brief.
- [ ] Reset active brief.
- [ ] Import CSV.
- [ ] Export Brief.
- [ ] Enter Review Mode.
- [ ] Print / Save PDF.
- [ ] Analyze Deal Risks.
- [ ] Check Review Readiness.
- [ ] Generate This Week's Actions.
- [ ] Use Mock Draft Assist.

Expected: existing Pipeline Defense workflows still work in local and cloud modes.

## H. Error Cases

- [ ] Temporarily go offline after signing in.
- [ ] Edit a brief.
- [ ] Confirm cloud save failure is visible.
- [ ] Confirm local copy is preserved.
- [ ] Restore connection.
- [ ] Refresh and validate no data loss in local copy.
- [ ] Simulate Supabase unavailable or invalid anon key.
- [ ] Confirm app falls back gracefully.

Expected: cloud sync failure does not destroy local data.
