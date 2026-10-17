# Add-to-Plan follow-up regression — 2026-10-17

User symptom: after an agenda, `add into Plan with details information` spun, then left the draft in the composer without a visible response.

## Confirmed reproduction

A real Groq request using a fictional three-task agenda and the exact follow-up returned HTTP 400 `tool_use_failed`: the model attempted a nonexistent `repo_browser.open_file` tool call despite having no tools configured. Memoire mapped it to provider-unavailable. This reproduces the reported flow; the exact upstream response from the user's original request was not captured.

The UI also rendered failures above the context and entire conversation. At the bottom of a long answer, that notice was outside the viewport, creating the apparent silent failure.

## Fix

- Explicit JSON-only/no-tools instructions and explicit handling of a latest-user request to convert the preceding agenda into typed Plan proposals. Draft history is data; the latest user request authorizes the proposal, and execution still requires confirmation.
- One same-model repair for HTTP 400 `tool_use_failed`, at temperature zero, sharing the original 25-second deadline. Failed tool arguments are never executed, logged, sent back to the provider or returned to the client. Persistent failure returns a verified-response error. Other errors, quota and bad keys are not automatically retried.
- Errors and retry countdown live inside the composer, with an alert and scrolling that keeps the whole composer visible. Failed requests preserve their input. Client requests also have a 35-second network deadline.

## Evidence

- Real Groq synthetic follow-up succeeded twice after the instruction change, returning three detailed dated Plan proposals. No executor was called.
- 37 focused chat/action/context tests passed, including repair scope, shared deadline, non-disclosure, retry ceiling and follow-up history.
- Full-page fictional browser fixture: long agenda → forced persistent format error → visible alert next to retained input → resubmit exact follow-up → two pending Plan items. Confirming reported both already-existing fictional items unchanged, without duplicates.
- Desktop alert and Send button were fully in the viewport (Send bottom 671 in a 720px viewport). Inspected [desktop error](evidence/ai-chat-followup-2026-10-17/visible-error.png), [mobile quota](evidence/ai-chat-followup-2026-10-17/mobile-quota.png) at 390×900, and [follow-up preview](evidence/ai-chat-followup-2026-10-17/followup-preview.png).

Fixture cloud acknowledgement is simulated. No real customer records were mutated. Whole-project checks, CI and production status are recorded in the private release receipt after release.
