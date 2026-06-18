# Memoire Auth Recovery Contract Coverage

Date: 2026-06-17

Roadmap slice: Gate A6 auth recovery contract verification

## Decision

Memoire now has an automated static verifier for the account verification, password recovery, reset-password, and Google OAuth redirect contract.

This does not close A6. It proves the app and `/api/health` still agree on the intended auth recovery paths. A6 remains open until Supabase dashboard settings and real email/OAuth flows pass on production or protected preview.

## Covered Contracts

| Surface | Contract | Current Static Status |
| --- | --- | --- |
| Public routes | `/login`, `/signup`, `/verify-email`, `/forgot-password`, and `/reset-password` remain mounted. | Covered by verifier |
| Signup | Verification email redirect goes to `/login?verified=1`; signup routes to `/verify-email`; signup event remains tracked. | Covered by verifier |
| Login | Login displays verified and password-updated status messages; protected return path is limited to `/app/*` with dashboard fallback. | Covered by verifier |
| Forgot password | Reset request redirects to `/reset-password` and shows a generic non-enumerating success message. | Covered by verifier |
| Reset password | Password policy, confirm-password check, invalid/expired reset state, and `/login?passwordUpdated=1` success redirect remain present. | Covered by verifier |
| Google OAuth | OAuth starts with a safe destination, stores a pending redirect, and returns to `/app/*` or `/app/dashboard`. | Covered by verifier |
| Demo cleanup | Auth completion still calls demo workspace cleanup before account workspace entry. | Covered by verifier |
| `/api/health` | Auth redirect output still includes `/login?verified=1`, `/reset-password`, and `/app/dashboard`, plus the Supabase checklist. | Covered by verifier |

## Automated Guard

Added:

- `scripts/verify-auth-recovery-contract.mjs`
- `npm run verify:auth-recovery`

Included in:

- `npm run check`

The verifier checks that app routes, auth provider behavior, public auth pages, Google auth button, `/api/health`, A6 QA runbook, release gate, and cohort release packet stay aligned.

## Runtime Evidence Still Required

Before inviting the first cohort, capture:

| Evidence | Pass Rule |
| --- | --- |
| `/api/health` auth output | Production or protected-preview health output includes expected auth redirect URLs on the deployed domain. |
| Supabase dashboard | Site URL and Redirect URL allowlist match the `/api/health` auth redirect output. |
| Signup verification | Test signup email lands on `/login?verified=1` and login page shows the verified message. |
| Forgot password | Request flow shows generic success and sends reset email without account enumeration. |
| Reset password | Reset email lands on `/reset-password`; new password works; old password fails. |
| Invalid reset | Expired or missing reset session shows the invalid/expired reset state. |
| Google OAuth | OAuth returns to the requested `/app/*` route or `/app/dashboard` and clears demo workspace state. |

## Gate Impact

A6 improves from "QA runbook and health redirect checklist added" to "auth recovery contract verified automatically."

A6 remains open because real email delivery, Supabase redirect allowlist, password reset, and Google OAuth must still pass on the deployed environment.
