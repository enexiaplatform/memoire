# Phase M.34 Auth Stability & Route Guard Checklist

## Signed-out local-first access
- Clear Supabase session from the browser.
- Open `/app/dashboard`.
- Confirm the app shell loads without redirecting to `/login`.
- Confirm local mode / demo mode content does not show a raw Supabase error.

## Signed-in access
- Sign in with Google.
- Confirm the app returns to `/app/dashboard` or the intended `/app/*` destination.
- Confirm the user email appears in the app chrome.
- Refresh `/app/dashboard`.
- Confirm the signed-in user is not kicked to `/login`.

## Core navigation
- Navigate Dashboard -> Capture.
- Navigate Capture -> Opportunities.
- Navigate Opportunities -> Pipeline Defense.
- Confirm each page loads without auth loading loops.

## Ghost route cleanup
- Open `/app`.
- Confirm it redirects to `/app/dashboard`.
- Open `/app/today`.
- Confirm it redirects cleanly to `/app/dashboard`.

## Demo workspace
- From `/login`, click `Open Demo Workspace`.
- Confirm it opens `/app/dashboard`.
- Confirm no sign-in is required.
- Confirm no loading loop appears.

## Legacy app routes
- Open `/app/ask`.
- Confirm it does not crash or loop.
- Open `/app/journey`.
- Confirm it does not crash or loop.

## Auth timeout/degraded profile behavior
- If possible, simulate a slow or failed `user_profiles` lookup.
- Confirm the valid auth session remains active.
- Confirm the app does not sign the user out only because profile lookup failed.
- Confirm the user-facing message is friendly.

## Error hygiene
- Trigger a Supabase auth restore retry or lock issue if reproducible.
- Confirm the UI does not show raw messages such as:
  - `Lock 'lock:sb-...-auth-token' was released because another request stole it`
  - `Multiple GoTrueClient instances detected`
  - `Auth bootstrap failed`
  - `Profile lookup timed out`
- Confirm detailed auth errors appear only in the development console.
