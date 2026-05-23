# Phase M.19 Supabase Live Setup Checklist

Use this checklist to verify Google OAuth sign-in and Supabase cloud persistence for `/app/pipeline-defense`.

## Supabase Database Setup

- [ ] Create or open the target Supabase project.
- [ ] Run SQL from `docs/database/supabase-pipeline-defense-schema.sql`.
- [ ] Confirm table exists: `public.pipeline_defense_briefs`.
- [ ] Confirm RLS is enabled for `public.pipeline_defense_briefs`.
- [ ] Confirm policies exist:
  - [ ] Users can select their own briefs.
  - [ ] Users can insert their own briefs.
  - [ ] Users can update their own briefs.
  - [ ] Users can delete their own briefs.
- [ ] Confirm policies use `auth.uid() = user_id`.
- [ ] Confirm the table is accessible through the Supabase Data API for authenticated users. In newer Supabase projects, new tables may not be exposed automatically even when RLS is correct.

## Google OAuth Setup

- [ ] Enable Google provider in Supabase Auth.
- [ ] Configure Google OAuth Client ID and Client Secret in Supabase.
- [ ] In Google Cloud Console, add authorized JavaScript origins:
  - [ ] Local dev URL, for example `http://localhost:5173`.
  - [ ] Local dev URL, for example `http://127.0.0.1:5173`.
  - [ ] Deployed Vercel origin, for example `https://YOUR-VERCEL-DOMAIN`.
- [ ] In Supabase Auth URL Configuration, add redirect URLs:
  - [ ] `http://localhost:5173/app/pipeline-defense`
  - [ ] `http://127.0.0.1:5173/app/pipeline-defense`
  - [ ] `https://YOUR-VERCEL-DOMAIN/app/pipeline-defense`

## Env Vars

- [ ] Add env vars locally in `.env`:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] Add env vars in Vercel:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] Do not commit `.env` with real credentials.
- [ ] Restart local dev server after env changes.
- [ ] Redeploy Vercel after env changes.

## Local Live Test

- [ ] Open local dev URL.
- [ ] Navigate to `/app/pipeline-defense`.
- [ ] Confirm local mode still loads.
- [ ] Click `Sign in with Google`.
- [ ] Complete OAuth.
- [ ] Confirm redirect returns to `/app/pipeline-defense`.
- [ ] Confirm account email/name appears.
- [ ] Confirm status says cloud sync is enabled or cloud briefs are loading.
- [ ] Create or edit a brief.
- [ ] Refresh and confirm data persists.

## Vercel Live Test

- [ ] Open deployed Vercel URL.
- [ ] Navigate to `/app/pipeline-defense`.
- [ ] Confirm direct route refresh works.
- [ ] Click `Sign in with Google`.
- [ ] Complete OAuth.
- [ ] Confirm redirect returns to deployed `/app/pipeline-defense`.
- [ ] Confirm account email/name appears.
- [ ] Create or edit a brief.
- [ ] Refresh and confirm data persists from cloud.
