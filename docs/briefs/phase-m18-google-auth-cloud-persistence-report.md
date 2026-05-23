# Phase M.18 Google Auth + Cloud Persistence Report

## Files Created

- `src/lib/supabaseClient.ts`
- `src/auth/AuthProvider.tsx`
- `src/components/auth/AuthButton.tsx`
- `src/services/pipelineDefenseCloudStore.ts`
- `docs/database/supabase-pipeline-defense-schema.sql`
- `docs/deployment/supabase-auth-setup.md`
- `docs/briefs/phase-m18-google-auth-cloud-persistence-report.md`

## Files Modified

- `.env.example`
- `src/main.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Auth Behavior

- Added a Supabase-backed auth provider using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added `Sign in with Google` and `Sign out` UI on Pipeline Defense.
- Missing Supabase env vars fail gracefully and keep local mode available.
- Pipeline Defense remains accessible without login so the local-first workflow still works.

## Cloud Persistence Behavior

- Signed-in users load briefs from the Supabase `pipeline_defense_briefs` table.
- Cloud-loaded briefs save back to Supabase after edits.
- Local storage is still written as a browser backup.
- Cloud status messages include loading, enabled, unavailable, saved to cloud, saved locally, and sync failed states.

## Local Fallback Behavior

- Logged-out users use localStorage exactly as before.
- If Supabase is not configured, Google sign-in reports that cloud sync is unavailable and the app stays local-first.
- If a cloud save fails, the local copy is preserved.

## Migration Behavior

- When a signed-in user has local briefs, a non-blocking migration panel appears.
- `Sync local briefs` uploads local briefs to the current user's Supabase account.
- `Keep local only` avoids uploading local browser data.
- `Dismiss` hides the panel without changing data.
- Local and cloud briefs are kept together; local migration creates cloud rows rather than blindly overwriting cloud rows.

## RLS/Database Setup

- Added SQL for `pipeline_defense_briefs`.
- RLS is enabled.
- Select, insert, update, and delete policies use `auth.uid() = user_id`.

## Env Vars Required

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## What Remains Intentionally Not Built

- No Gmail API integration.
- No Gmail inbox access.
- No CRM sync.
- No team workspace.
- No real AI provider or LLM API.
- No server-side PDF generation.

## Build/Lint Status

- `npm run build`: passed.
- `npm run lint`: passed with 5 documented pre-existing hook dependency warnings outside Pipeline Defense.
- Targeted scan of the new Pipeline Defense auth/cloud files found no Gmail inbox integration, CRM sync, or real AI provider code.
