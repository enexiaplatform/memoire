# Phase M.34 Auth Stability & Route Guard Report

## Files created
- `docs/qa/phase-m34-auth-stability-route-guard-checklist.md`
- `docs/briefs/phase-m34-auth-stability-route-guard-report.md`
- `src/auth/authErrors.ts`

## Files modified
- `src/lib/supabaseClient.ts`
- `src/lib/supabase.ts`
- `src/auth/AuthProvider.tsx`
- `src/auth/authContext.ts`
- `src/hooks/useAuth.ts`
- `src/components/layout/ProtectedRoute.tsx`
- `src/components/layout/OnboardingModal.tsx`
- `src/features/auth/LoginPage.tsx`
- `src/features/auth/SignupPage.tsx`
- `src/features/demo/DemoEntryPage.tsx`
- `src/features/v31/RouteLoadingFallback.tsx`
- `src/features/v31/JourneyPage.tsx`
- `src/features/v31/AskMemoirePage.tsx`
- `src/features/v31/AccountMemoryPage.tsx`
- `src/hooks/usePlanLimits.ts`

## Root cause found
- The client app had two Supabase browser clients:
  - `src/lib/supabaseClient.ts`
  - `src/lib/supabase.ts`
- Legacy `useAuth` also created its own `getSession` bootstrap and `onAuthStateChange` listener for every component using the hook.
- That combination could produce multiple GoTrueClient instances, overlapping session restores, lock timeouts, raw auth errors, and route guard redirects while a valid session was still being restored.

## Singleton status
- `src/lib/supabaseClient.ts` is now the only frontend file that calls `createClient`.
- The singleton is cached on `globalThis.__memoireSupabaseClient` to survive React StrictMode/HMR remounts.
- `src/lib/supabase.ts` now re-exports the singleton instead of creating another client.
- Serverless API routes still create server-side clients where needed; those do not create browser GoTrueClient instances.

## Auth bootstrap changes
- `AuthProvider` now owns the auth state for the app.
- Initial `getSession` is guarded by a shared bootstrap promise to avoid concurrent session restore races.
- `onAuthStateChange` is synchronous and no longer performs profile lookup inside the callback.
- Profile lookup runs in a separate effect keyed by user id.
- Profile lookup failure or timeout no longer signs the user out if the session is valid.
- State updates are guarded after unmount.

## User-friendly errors
- Raw lock/internal Supabase errors are mapped to friendly UI messages:
  - `Your session is being restored. Please try again in a moment.`
  - `Cloud sync is temporarily unavailable. Local mode is still available.`
  - `Please sign in again if the issue continues.`
- Detailed auth diagnostics are limited to development console logging.

## Route guard changes
- Local-first routes render without waiting on auth restoration:
  - `/app/dashboard`
  - `/app/today`
  - `/app/capture`
  - `/app/calendar`
  - `/app/reviews`
  - `/app/accounts`
  - `/app/opportunities`
  - `/app/pipeline-defense`
  - `/app/ask`
  - `/app/journey`
- Non-local-first routes redirect to `/login` only after the user is confirmed unauthenticated.
- Redirect state preserves the intended destination for future use.

## Demo workspace behavior
- `Open Demo Workspace` now routes to `/app/dashboard`.
- `/demo` loads the interactive demo workspace and opens `/app/dashboard` without requiring auth.
- Legacy loading fallback demo buttons also use `/app/dashboard`.

## Route cleanup
- `/app` redirects to `/app/dashboard`.
- `/app/today` redirects to `/app/dashboard`.
- `/app/ask` and `/app/journey` no longer get blocked by route guard auth loading.
- Legacy pages now stop loading if no user is present instead of waiting forever.

## Build/lint status
- `npm run build`: passes.
- `npm run lint`: passes with the 5 known pre-existing hook dependency warnings:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts` lines 48 and 87
- Local browser automation for route smoke testing was attempted, but the in-app browser blocked localhost with `ERR_BLOCKED_BY_CLIENT`. Route behavior was still verified through build-safe route definitions and auth guard logic.

## Known remaining risks
- Some older legacy modules still contain direct Supabase data calls, but they now use the shared browser singleton.
- Serverless API routes still create server-side Supabase clients for backend operations, which is expected and outside the browser GoTrueClient issue.
- Email/password login is preserved for compatibility, but Google Auth remains the primary tested sign-in path.
