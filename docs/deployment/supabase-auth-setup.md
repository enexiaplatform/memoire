# Supabase Auth Setup For Pipeline Defense

## 1. Create Supabase Project

Create or choose the Supabase project that should store Pipeline Defense briefs.

## 2. Enable Google Provider

In Supabase, open Authentication -> Providers and enable Google.

## 3. Configure Google OAuth Credentials

Create Google OAuth credentials in Google Cloud Console, then paste the client ID and client secret into the Supabase Google provider settings.

This is Google OAuth sign-in only. It does not enable Gmail inbox access.

## 4. Add Redirect URLs

Add redirect URLs for local development and deployment:

- `http://localhost:5173/app/pipeline-defense`
- `http://127.0.0.1:5173/app/pipeline-defense`
- `https://YOUR-VERCEL-DOMAIN/app/pipeline-defense`

Also confirm Supabase Site URL matches the deployed app domain when testing production.

## 5. Add Local Env Vars

Create or update `.env`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do not commit real credentials.

## 6. Add Vercel Env Vars

In Vercel project settings, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Redeploy after adding env vars.

## 7. Run SQL Schema

Run `docs/database/supabase-pipeline-defense-schema.sql` in the Supabase SQL editor.

The schema creates `pipeline_defense_briefs`, enables RLS, and adds policies so users can only access their own briefs.

## 8. Test Sign-In

1. Open `/app/pipeline-defense`.
2. Click `Sign in with Google`.
3. Complete the OAuth flow.
4. Confirm the page returns to `/app/pipeline-defense`.
5. Confirm the account control shows the signed-in email/name.

## 9. Test Cloud Persistence

1. Create or edit a brief while signed in.
2. Confirm status changes to `Saved to cloud`.
3. Open a different browser or device.
4. Sign in with the same Google account.
5. Confirm the cloud briefs load.
6. If local briefs exist, use `Sync local briefs` to migrate them.

## Privacy Notes

- Pipeline Defense data is stored in Supabase only after sign-in and sync.
- Logged-out mode still uses browser `localStorage`.
- Do not enter confidential customer information until project access, OAuth settings, and Supabase RLS have been verified.
