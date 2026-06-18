# Memoire Auth Recovery Production QA

Date: 2026-06-17

Roadmap link: Gate A6 - Account recovery on production domain

## Purpose

A6 proves that a real early-access user can verify email, recover a password, and return to the right Memoire route on the deployed domain.

This cannot be fully proven from local source code. It requires Supabase Auth dashboard configuration and at least one production or protected-preview email flow.

## Code And Config Signals

Current app behavior:

- Signup verification redirects to `/login?verified=1`.
- Forgot password requests redirect to `/reset-password`.
- Google OAuth returns to the requested protected `/app/*` route when supplied, otherwise the app dashboard.
- `/api/health` now returns `authRedirects.requiredUrls` derived from `VITE_APP_URL`.
- `npm run verify:auth-recovery` statically verifies app routes, auth redirect paths, status messages, OAuth destination constraints, and `/api/health` auth redirect output.

Before running browser QA, open deployed `/api/health` and confirm:

- HTTP status is `200`.
- `ok` is `true`.
- `app_url_valid` passes.
- `app_url_https` has no warning for customer-facing production.
- `app_url_not_localhost` has no warning for customer-facing production.
- `authRedirects.requiredUrls` are present and match the intended Supabase Auth allowlist.

## Supabase Dashboard Checklist

Before dashboard/browser QA, run:

```bash
npm run verify:auth-recovery
```

In Supabase Auth settings for the deployed project:

- Site URL equals deployed `VITE_APP_URL`.
- Redirect URL allowlist includes:
  - `VITE_APP_URL/login?verified=1`
  - `VITE_APP_URL/reset-password`
  - `VITE_APP_URL/app/dashboard`
  - Any protected `/app/*` route used for Google OAuth QA.
- Email confirmation setting matches the public signup copy.
- Password reset email template links to the configured recovery redirect.
- Google OAuth provider is configured for the production domain if Google sign-in is offered.

## QA Matrix

Use a non-customer test email account.

| ID | Flow | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- |
| A6-01 | Health redirect check | Open production `/api/health`. | `ok: true`; auth redirect URLs use the production domain. | Screenshot or copied JSON with secrets absent. |
| A6-02 | Password signup verification | Sign up with a new test email, open verification email. | Browser lands on `/login?verified=1`; login page shows verified message. | Timestamped screenshot and test email. |
| A6-03 | Forgot password request | From `/forgot-password`, submit the verified test email. | UI shows generic success message; no account enumeration. | Screenshot. |
| A6-04 | Reset password link | Open reset email. | Browser lands on `/reset-password`; app allows new password entry. | URL and screenshot. |
| A6-05 | New password works | Update password, then sign in with new password. | App routes to `/app/dashboard`; old password fails. | Result notes, no passwords stored. |
| A6-06 | Expired/invalid reset | Reuse old reset link or open `/reset-password` without session. | App shows invalid/expired reset message and link to request another. | Screenshot. |
| A6-07 | Google OAuth return | Start from a protected `/app/*` route and continue with Google. | OAuth returns to the requested route or `/app/dashboard`; demo data is cleared. | Before/after URL and screenshot. |
| A6-08 | Email resend/verification copy | Repeat signup or resend verification if available from Supabase email flow. | Copy and redirect behavior match product expectations. | Notes and screenshot. |

## Pass Criteria

A6 passes only when:

- All A6-01 through A6-07 pass.
- Supabase Auth Site URL and Redirect URL allowlist match `/api/health` auth redirect output.
- Test email delivery works on the production or protected-preview domain.
- No redirect lands on localhost, preview when production is expected, or an unapproved domain.
- No password, token, or magic-link secret is stored in QA notes.

## Remaining Gap

This runbook and `/api/health` redirect output are readiness aids. A6 remains open until the QA matrix is run against the deployed environment and evidence is stored.
