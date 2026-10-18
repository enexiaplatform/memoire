# Next-week Plan preparation regression — 2026-10-17

## Confirmed defect

“Chuẩn bị plan tuần sau cho tôi” used the same analysis as a query about already scheduled work next week. The future Plan board correctly contained zero items, but overdue/current next actions were not provided as draft candidates. The model therefore asked the user to re-enter task details. Planning also excluded working Leads because this branch reused the qualified-pipeline selector.

## Correction

Preparation/drafting intent now supplies a separate, bounded pool of recorded next actions on active opportunities and working Leads. The existing current Plan engine determines unfinished/current/carried work and honors completion/grouping. Undated next actions can also be proposed. When the next action itself is missing, propose a clearly labeled record review to clarify the next step, without inventing a customer promise. A fresh production preview exposed zero candidates with the narrower recorded-action-only rule, so missing-action review work is part of this fix. Up to five candidates receive proposed Monday–Friday dates, preserve original due dates and have no invented channel. Candidate identities take retrieval priority so scheduled rows cannot crowd them out.

Existing future-calendar counts remain separate and accurate. Ordinary questions about already scheduled work do not enter drafting mode. Won/Lost, On hold, disqualified Leads, completed work and tasks dated beyond the requested week do not become draft candidates. Existing personal Plan tasks are not automatically moved. All dates in the new candidate pool are suggestions, not confirmed appointments.

## Verification

- 72 focused AI tests passed, including an empty next-week calendar with current/overdue work, an overdue Lead, an undated action, completed/closed/future exclusions, normal calendar intent and candidate retention alongside many scheduled records, and history-budget reservation for long draft conversion.
- Actual Groq received the exact reported Vietnamese request against fictional records with zero next-week items. It returned a Vietnamese dated draft for both overdue actions and no writes.
- A subsequent “Thêm các việc trên vào Plan” returned exactly two `create_plan` actions, dated 2026-10-19 and 2026-10-20, linked to the original Lead and Opportunity. The reference-target guard passed. The actual intent/batch/application functions saved two correctly linked Plan records using in-memory writers. No production business writes were used for QA.
- An initial full-check timing gate measured an unrelated unchanged pipeline engine at 3.2× against a 3× ceiling. The resumed exact check chain reran that gate; final unit/contract and release results are recorded in the private release receipt. No timing threshold was weakened.

[Synthetic provider and save evidence](evidence/ai-next-week-draft-2026-10-17/synthetic-provider-and-save.json). The full unit run passed 2,284 tests before the additional long-agenda regression, which also passed in the final focused run. Draft conversion now reserves input room for the preceding agenda while retaining calculated facts and exact writable identities; local budget failures are displayed in the composer instead of escaping its error boundary.

Release acceptance requires completed local checks, exact-commit CI, production READY and fresh read-only production smoke. Provider tests use real Groq with fictional context and mocked ownership; in-memory execution is not production cloud-write acceptance.

A production-sized scope with long Vietnamese account names also exposed the input budget: draft creation now omits unrelated personal Plan edit identities and avoids repeating account names in each candidate fact. Exact candidate opportunity IDs and their source identities remain intact. A 100-opportunity long-name regression verifies five candidates fit the reserved budget.
