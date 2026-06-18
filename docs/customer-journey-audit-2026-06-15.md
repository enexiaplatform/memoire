# Memoire Customer Journey Audit

Date: 2026-06-15

## Journey reviewed

Landing -> Demo or Request Access -> Login/Signup -> First workspace visit -> First pipeline review -> Pipeline Defense Brief -> Return usage.

## Fixed in this audit

- Login now preserves the protected app destination that the customer originally requested.
- Google login receives the same safe post-login destination.
- `View Demo Guide` now loads the demo sandbox before opening the protected guide.
- Duplicate `Open App` and `Log in` navigation actions were reduced to one clear login action.
- Public copy no longer claims that the full app can be used signed out.
- Founder validation forms, interview tools, and validation logs are hidden unless founder workspace mode is enabled.
- Request Access now submits through a rate-limited server endpoint to a private Supabase table.
- The public request form was reduced to five core questions plus explicit follow-up consent.
- Forgot-password, reset-password, and resend-verification flows were added.
- Public signup and guided-access messaging now describe one consistent open early-access model.
- Invalid URLs now show a useful 404 page.
- The long guided workflow no longer opens automatically over the dashboard onboarding experience.
- The dashboard now presents one visible `Start here` entry instead of stacking a second getting-started checklist above the empty state.
- Demo completion now directs customers to create an account or log in before using real pipeline data.
- Request Access no longer labels the login route as `Open App`.
- Successful signup or login now clears the local demo sandbox before the real account workspace opens, preventing sample records from appearing in account mode.
- Data-mode language now distinguishes demo-browser, browser-only, cloud-plus-browser, and sync-issue states.
- The top navigation shows workspace storage status consistently across app routes.
- Privacy-minimized funnel events now measure demo start/completion, signup, request access, CSV import, and review-pack saves without collecting sales content.

## Critical gaps

### Resolved - Request Access is now a real submission

Requests are stored in a private RLS-enabled Supabase table through a server-only service role. The public browser cannot read the lead table. The flow includes consent, a durable success state, and a two-business-day response expectation.

Remaining operator work: configure a notification or CRM automation for new records and define the lead retention/deletion schedule.

### Resolved - Access model

Memoire now presents open early-access account creation as the primary path, with Request Access positioned as optional guided support.

## High-priority missing flow

### Resolved - Account recovery

Forgot-password, reset-password, and resend-verification paths are now available. Change-email self-service remains a later settings enhancement.

### Improved - Too many onboarding systems

The customer-facing dashboard now has one visible `Start here` panel. The detailed first-review and activation tools remain collapsed under `Review setup`, while the older guided workflow is available only when deliberately replayed from Settings.

Recommended customer sequence:

1. One first-run choice: import CSV, add one opportunity, or try demo.
2. One contextual checklist ending at a saved Pipeline Defense Brief.
3. Hide all other onboarding systems after the first value moment.

### Improved - Data-mode expectations

The app now uses persistent plain-language status and explicitly states that account mode is hybrid rather than claiming every object is synced. Review Packs, Sales Assets, and Action Outcomes now sync to the signed-in account while preserving a responsive browser copy. Demo records remain browser-only and are excluded from cloud sync.

- Where is this record stored?
- Will it sync?
- What happens if browser data is cleared?
- Cross-device deletion uses cloud tombstones so stale browser copies do not recreate deleted records.
- Local collection ownership prevents one signed-in account from inheriting another account's browser cache.
- Cloud conflict resolution now preserves the newest record instead of allowing an older browser copy to overwrite newer cloud data.
- Password signup and reset require 12+ characters with uppercase, lowercase, a number, and a symbol. Supabase leaked-password checks require a paid plan, so the app enforces the strongest practical client/server-side policy available on the current Free plan.
- The pgvector extension now lives in the `extensions` schema while the existing semantic search function remains operational.

## Medium-priority cleanup

- Add a useful not-found page instead of silently redirecting every invalid URL to landing.
- Let authenticated users view public pricing/legal pages without forced landing redirect behavior.
- Add lightweight funnel analytics for demo start, demo completion, request access, signup, first import, first brief, and return usage.
- Reduce the public Request Access form from ten fields to the minimum needed for follow-up.
- Add a clear next step and response-time promise after Request Access submission.
- Review the `More tools` navigation after customer interviews; seven secondary modules may be too broad before the core weekly-review habit is established.

## Current core flow assessment

The demo-to-Pipeline-Defense path is the strongest journey and should remain the primary acquisition experience. The product has enough empty states and local fallback behavior for exploration, but conversion and account recovery are not launch-complete until the P0 and P1 gaps above are resolved.
