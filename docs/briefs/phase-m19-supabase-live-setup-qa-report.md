# Phase M.19 Supabase Live Setup & Auth Sync QA Report

## Files Created

- `docs/deployment/phase-m19-supabase-live-setup-checklist.md`
- `docs/deployment/phase-m19-auth-cloud-sync-qa-matrix.md`
- `docs/deployment/phase-m19-supabase-auth-debugging.md`
- `docs/briefs/phase-m19-supabase-live-setup-qa-report.md`

## Files Modified

- `src/auth/AuthProvider.tsx`
- `src/services/pipelineDefenseCloudStore.ts`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Whether Code Changed

- Yes. Added minimal development-only debug logs for auth/cloud sync.
- Logs are gated behind `import.meta.env.DEV`.
- Logs do not include deal contents or customer data.

## Live Setup Steps Documented

- Supabase project setup.
- SQL schema execution.
- Table/RLS/policy checks.
- Google OAuth setup.
- Local and Vercel redirect URLs.
- Local and Vercel env vars.
- Local and deployed sign-in tests.

## QA Matrix Documented

- Logged-out localStorage mode.
- Missing env vars.
- Logged-in cloud mode.
- Cross-browser/device sync.
- Local-to-cloud migration.
- RLS isolation.
- CRUD and existing MVP workflows.
- Error cases and local copy preservation.

## Debugging Guide Documented

- Wrong redirect URL.
- OAuth provider disabled.
- Redirect URL not whitelisted.
- Missing Vite env vars after deploy.
- Need to restart/redeploy after env changes.
- RLS insert mismatch.
- Empty SELECT due to RLS.
- Local briefs not syncing.
- Cloud data not loading.
- Supabase client unavailable.

## Build/Lint Result

- `npm run build`: passed.
- `npm run lint`: passed with 5 documented pre-existing hook dependency warnings outside Pipeline Defense.
- Local direct route check: `http://127.0.0.1:5173/app/pipeline-defense` returned HTTP 200 and served the Vite app shell.
- Credential scan found no committed Supabase/OpenAI/Groq/Anthropic/Stripe-style secrets outside dependency lockfile integrity hashes.

## What Still Requires Henry/Supabase Console Action

- Create/open the real Supabase project.
- Run `docs/database/supabase-pipeline-defense-schema.sql`.
- Confirm table Data API exposure if required by the Supabase project settings.
- Enable Google provider.
- Configure Google OAuth credentials.
- Add local and deployed redirect URLs.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` locally and in Vercel.
- Redeploy after Vercel env vars are added.
- Run the QA matrix with real Google accounts.

## What Remains Intentionally Not Built

- No Gmail inbox/API integration.
- No CRM sync.
- No team workspace.
- No real AI/LLM integration.
- No hardcoded Supabase credentials.
- No RLS disabling.
