# Accessibility And Failure-State QA

Date: 2026-06-17

Roadmap link: C6 accessibility and slow/failure-state readiness

## Decision

Memoire now has a small app-shell accessibility hardening pass and a repeatable C6 QA protocol.

This does not close C6. C6 requires a manual browser pass on protected production or preview, including keyboard navigation, focus order, modal behavior, and slow/unavailable backend states.

## Code Changes

Updated:

- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/index.css`

What changed:

- App workspace now includes a visible-on-focus "Skip to main content" link.
- The app `main` landmark has a stable `id`, label, and focus target.
- Mobile navigation can be closed with `Escape` when open.

## 2026-07-02 Modal Accessibility Hardening

Updated:

- `src/components/ui/Modal.tsx` — the shared Modal now sets `role="dialog"`, `aria-modal`, and an accessible label, moves focus into the dialog on open, traps `Tab`/`Shift+Tab` inside it, and restores focus to the previously focused element on close.
- `src/hooks/useEscapeToClose.ts` — new shared hook: closes a mounted modal/drawer on `Escape`.
- Ad-hoc overlays upgraded with `role="dialog"`, `aria-modal`, an accessible label, and Escape-to-close: Follow-up Composer (C6-09), guided-workflow welcome overlay (C6-10, Escape maps to Skip), demo-entry confirm dialog, dashboard demo sandbox prompt, Pipeline Defense Brief preview (Opportunities), quote create/edit drawer (Quotes), activity detail modal (Calendar). `CaptureDetailModal` already closed on Escape and now exposes the dialog role.

This narrows C6-09/C6-10 to verification-only. The full C6 manual matrix on protected production or preview is still required.

Verified 2026-07-02: `npm run check` and `npm run build` pass; runtime smoke confirms the demo-entry confirm dialog exposes `role="dialog"` with label "Start demo sandbox" and closes on `Escape` with no console errors.

## 2026-07-02 App-Level Error Boundary

Previously no React error boundary existed anywhere: any render error produced a permanent white screen. Added:

- `src/components/common/AppErrorBoundary.tsx` — class boundary wrapping all routes in `src/App.tsx`. The fallback is a branded `role="alert"` card with "Reload page" and "Go to Today" actions and reassurance that saved data is unaffected. Stale-deploy chunk-load failures (`Failed to fetch dynamically imported module` and variants) get dedicated copy: "A newer version of Memoire is available."
- Render errors report to serverless logs through the existing `reportClientOperationalEvent` path; `client_render_error` was added to the `api/client-log.ts` allowlist and the telemetry event union.
- Contract coverage added to `verify-accessibility-failure-state-contract.mjs`: boundary lifecycle markers, fallback copy, App wiring, and API allowlist.

Verified: `npm run check` passes (including the production-readiness client-log runtime contract) and the app renders normally with the boundary in place, no console errors.

## QA Scope

Run this against the protected production or preview deployment before broader public selling.

Use:

- Desktop Chrome or Edge.
- Mobile viewport.
- Keyboard only for keyboard tests.
- One signed-in test account and demo mode.

Do not use real confidential customer data.

## Keyboard And Focus Matrix

| ID | Area | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- |
| C6-01 | Skip link | Load `/app/dashboard`, press `Tab` once. | "Skip to main content" appears and receives focus. | Screenshot or note. |
| C6-02 | Skip target | Press `Enter` on the skip link. | Focus moves to the workspace main content, not the sidebar/top nav. | Focus outline or browser accessibility note. |
| C6-03 | Sidebar tab order | Use keyboard to tab through primary nav. | Navigation order is predictable and active route is visible. | Notes. |
| C6-04 | Mobile nav open | Mobile viewport, tab to menu button, press `Enter`. | Navigation opens and close control is reachable. | Screenshot. |
| C6-05 | Mobile nav Escape | With mobile navigation open, press `Escape`. | Navigation closes. | Notes. |
| C6-06 | Settings tabs | Keyboard through Settings tabs and actions. | Data & Privacy and Export & Delete are reachable and operable. | Notes. |
| C6-07 | Quick Capture | Keyboard through raw note, structure button, preview fields, save button. | Input, action, editable preview, and save controls are reachable in order. | Notes. |
| C6-08 | Pipeline Defense | Keyboard through create/import/generate/review actions. | Core actions are reachable without pointer input. | Notes. |
| C6-09 | Follow-up Composer | Open composer, keyboard through fields, generate, copy, close. | Modal can be used and closed without pointer input. | Notes. |
| C6-10 | Onboarding modal | Replay guided workflow from Settings. | Modal focus and close behavior do not trap the user incorrectly. | Notes. |

## Slow And Failure-State Matrix

| ID | Area | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- |
| C6-11 | Auth slow load | Simulate slow auth/profile response or throttled network. | Protected route shows loading and then slow fallback with retry/sign out/demo options. | Screenshot. |
| C6-12 | Workspace slow load | Throttle route data load on Ask/Accounts/Journey. | Route loading fallback appears with retry path. | Screenshot. |
| C6-13 | Supabase unavailable | Use preview/local env with unavailable Supabase URL or blocked requests. | App fails gracefully; raw backend errors are not shown as primary UX. | Notes. |
| C6-14 | Cloud export unavailable | Signed-in export with export endpoint unavailable. | Export stops with clear error instead of producing incomplete signed-in cloud export. | Screenshot. |
| C6-15 | Cloud sync issue | Simulate failed cloud JSON save. | User work remains locally preserved and operational event is logged if configured. | Notes/log reference. |
| C6-16 | AI provider unavailable | Ask Memoire or Daily Capture with AI endpoint unavailable. | Local/rule-based fallback remains available where designed. | Screenshot. |
| C6-17 | Delete account failure | Force delete endpoint failure in test environment. | User sees recoverable support message; local data is not silently cleared. | Notes. |

## Pass Criteria

C6 can move from missing to operational evidence only when:

- C6-01 through C6-17 pass or every failure has an accepted-risk decision.
- Mobile and desktop evidence is recorded.
- Any raw-error exposure is fixed before public selling.
- Any keyboard trap or unreachable primary action is fixed before public selling.
- Slow/unavailable Supabase and AI-provider states do not cause data loss.

## Current Status

Static/code readiness:

- Skip link and main landmark added.
- Mobile navigation Escape close added.
- QA protocol exists.

Operational QA status:

- Not run.
- C6 remains open until the matrix passes against protected production or preview.
