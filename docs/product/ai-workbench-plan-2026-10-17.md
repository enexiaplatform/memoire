# Memoire AI workbench — implementation plan, 2026-10-17

## Product objective
Use one conversational assistant throughout the existing product, grounded in the seller's recorded workspace. Support the full loop: understand the situation, explain evidence/gaps, prepare useful work, apply supported changes, report the actual result. Keep the existing navigation and Groq stack.

## Current audit
- Full-scope deterministic tools currently cover weekly follow-ups, quarter forecast, brand estimates and a workspace overview.
- Detailed retrieval is limited to five opportunities and omits stakeholders, objection records, outcome lessons and personal Plan identities.
- Only create_plan and update_opportunity are supported. Old Plan confirmation/prose-save bugs were fixed in the preceding release; preserve those regressions.
- Floating chat always uses all-workspace context and generic prompts. Record-specific context can be selected only in full chat.
- Most data collections already exist in the canonical workspace loader. No new database schema is needed for this release.

## Release scope and acceptance
1. Discoverable workflow catalog: Today priorities, Plan, lead qualification, customer/meeting preparation, opportunity coaching, forecast review, collections follow-up, personal win/loss learning, brand analysis, data hygiene, note-to-existing-record updates. Offer relevant starters on the current page, with the full catalog available in chat. Starters fill the composer; only Send transmits.
2. Deterministic analytical coverage: use the existing lead qualification, pipeline defense, order/receivables and Plan engines; scoped counts precede bounded details. Missing values/FX remain unknown. Recorded outcomes and lessons are evidence, not causal predictions.
3. Richer attributable evidence: exact-ID linked stakeholders (no contact details), open objections, recorded outcomes, personal Plan sources, current commercial evidence. Preview every added source, exclude raw notes/attachments and other owners/samples. Do not present superseded evidence as current.
4. New writes: update an existing personal Plan's date/label/channel and update an existing account's strategy/next-follow-up/relationship status. Existing create Plan commands remain direct-save. Editing existing records is a whole-batch reviewed operation. Preserve identity, detect stale records, stop on partial cloud failures, and retain receipts. Plan completion continues through the canonical completion/history flow.
5. Context integration: from the floating chat, explicitly switch to the account/opportunity being viewed; changing scope starts a new conversation. Normal navigation/minimize preserves the conversation.
6. Verification and release: focused intent/scope/source/analytics/action tests, browser tests with fictional writes, real-provider synthetic tests, canonical checks, CI, production READY and live read-only smoke. No real customer writes for QA. Record precise evidence boundaries.

## Completion boundary
This release implements every item above. External research, sending customer messages, financial postings, deleting/merging records, closing Won/Lost, qualifying leads, changing Brand identity, inventing calendars/appointments, and changing existing report definitions stay with their existing canonical workflows. The assistant explains the next step and links there; it never substitutes a different write. This is an internal product improvement, not authorization to contact customers or create real records during testing.
