# Phase M.19 Supabase Auth Debugging Guide

## 1. Google Login Redirects To Wrong URL

- Symptom: OAuth completes but returns to the landing page, localhost, or another route.
- Likely cause: redirect URL mismatch between app, Supabase Auth URL settings, and Google OAuth settings.
- How to check: inspect the redirect URL in the browser address bar during OAuth and compare it with Supabase Auth URL Configuration.
- Fix: add the exact `/app/pipeline-defense` local and deployed redirect URLs in Supabase, then retry.

## 2. OAuth Provider Not Enabled

- Symptom: clicking `Sign in with Google` fails immediately or shows provider error.
- Likely cause: Google provider is disabled in Supabase.
- How to check: Supabase Dashboard -> Authentication -> Providers -> Google.
- Fix: enable Google provider and add Google OAuth Client ID/Secret.

## 3. Redirect URL Not Whitelisted

- Symptom: OAuth shows `redirect_uri_mismatch` or Supabase rejects the callback.
- Likely cause: Google Cloud Console or Supabase Auth URL Configuration is missing the exact local/deployed URL.
- How to check: compare protocol, hostname, port, and path exactly.
- Fix: add local dev and deployed Vercel URLs to both Google and Supabase settings where applicable.

## 4. Vite Env Vars Missing After Deploy

- Symptom: deployed app shows local mode or cloud sync unavailable.
- Likely cause: `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing in Vercel.
- How to check: Vercel Project Settings -> Environment Variables.
- Fix: add both vars, then redeploy. Vite env vars are baked into the build.

## 5. Need Redeploy Or Restart After Env Changes

- Symptom: env vars are added but app behavior does not change.
- Likely cause: local dev server or Vercel build was not restarted after env changes.
- How to check: stop and restart local dev; verify latest Vercel deployment timestamp.
- Fix: restart `npm run dev` locally and redeploy Vercel.

## 6. RLS Insert Fails Because `user_id` Mismatch

- Symptom: insert returns RLS/policy violation.
- Likely cause: inserted `user_id` does not match `auth.uid()`.
- How to check: inspect request payload and current authenticated user ID.
- Fix: ensure client inserts the current Supabase `user.id` into `user_id`. Do not use user-editable metadata for authorization.

## 7. Select Returns Empty Due To RLS

- Symptom: table has rows but app loads zero briefs.
- Likely cause: rows belong to a different `user_id`, SELECT policy is missing, or auth session is not active.
- How to check: run a SQL query in Supabase and compare row `user_id` with the authenticated user's ID.
- Fix: confirm SELECT policy exists and rows have the correct `user_id`.

## 8. Local Briefs Not Syncing

- Symptom: migration prompt appears, but clicking `Sync local briefs` fails or no rows are created.
- Likely cause: missing env vars, missing table, RLS insert failure, or Data API exposure issue.
- How to check: browser dev console in development, Supabase logs, and table row count.
- Fix: verify env vars, run schema SQL, confirm RLS policies, and confirm table is exposed to the Data API for authenticated users.

## 9. Cloud Data Not Loading After Sign-In

- Symptom: user signs in but only local/sample briefs appear.
- Likely cause: cloud table is empty, Data API access is disabled, RLS SELECT policy blocks rows, or cloud load failed.
- How to check: Supabase table editor and browser dev console in development.
- Fix: confirm rows exist for the current `user_id`, SELECT policy exists, and Data API access is available.

## 10. User Sees Only Local Mode Because Supabase Client Unavailable

- Symptom: auth button says sign-in is unavailable or cloud sync unavailable.
- Likely cause: `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is blank, placeholder, or not included in the current build.
- How to check: `.env`, Vercel env vars, and latest deployment build settings.
- Fix: add Vite env vars and restart/redeploy.

## Development Debug Logs

In local development only, the app emits minimal console debug logs for:

- auth session loaded
- auth state changed
- cloud load started/completed
- cloud create/update/delete started/completed
- cloud save failed
- migration started/failed

Logs do not include deal contents or customer data.
