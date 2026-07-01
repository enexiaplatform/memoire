# UI Polish Runtime Smoke - 2026-07-01

## Scope

This note records a lightweight local runtime smoke check after the latest UI polish passes.

The check is not a full manual browser QA pass. It confirms the built app can be served by Vite preview and that key SPA routes return the expected app shell without an obvious Vite error overlay in the served HTML.

## Environment

- Workspace: `E:\Antigravity project\Memoire`
- Command: `npm run preview -- --host 127.0.0.1 --port 4177`
- Local URL: `http://127.0.0.1:4177`
- Date: 2026-07-01

## Routes Checked

| Route | Result | Evidence |
| --- | --- | --- |
| `/` | Pass | HTTP 200, app root present, no Vite overlay marker |
| `/pricing` | Pass | HTTP 200, app root present, no Vite overlay marker |
| `/demo` | Pass | HTTP 200, app root present, no Vite overlay marker |
| `/login` | Pass | HTTP 200, app root present, no Vite overlay marker |
| `/request-access` | Pass | HTTP 200, app root present, no Vite overlay marker |
| `/app/today` | Pass | HTTP 200, app root present, no Vite overlay marker |

## Notes

- `agent-browser` was not available in the local PATH, so this run used HTTP smoke checks rather than screenshot or console inspection.
- This does not replace the protected-preview manual browser pass for auth, demo isolation, export, delete account, or two-account QA.
- Use this note only as supporting evidence that the current polished build serves key routes successfully from local preview.

