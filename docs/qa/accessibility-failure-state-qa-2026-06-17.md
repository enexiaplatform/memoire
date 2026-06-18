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
