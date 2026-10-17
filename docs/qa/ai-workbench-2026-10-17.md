# AI workbench verification — 2026-10-17

## Delivered scope

The eleven workflows in [the implementation plan](../product/ai-workbench-plan-2026-10-17.md) are implemented inside the existing chat and navigation. Starters fill the composer without sending. The floating chat can explicitly start a new conversation using the account/opportunity currently being viewed.

New reviewed writes edit an existing Plan's date/task/channel or an account's strategy/follow-up/relationship. Stable identities, links and creation history survive edits. Stale, completed, derived, foreign-owner and deleted targets fail preflight. Existing explicit Plan creation remains direct-save; edits require reviewing the batch. Receipts link to the saved Plan week.

Readings use the canonical qualification, pipeline defense, Plan, order/receivable and learning engines. Stakeholders, open objections, current evidence and outcome lessons provide attributable supporting context. Raw notes, contact details, samples and foreign-owner records are excluded. Missing values/FX suppress combined money totals. No new database schema or dependencies.

## Verification evidence

- 65 focused AI tests cover scope/privacy, canonical calculations, action allowlists, identity preservation, stale/partial-write handling, provider schema and context budget. The final complete unit run passed 2,280 tests, including the corrected population/sample assertions; build, API typecheck and lint also passed.
- Actual Groq calls with synthetic records returned HTTP 200 and the exact existing Plan/account target for both new action kinds. A read-only stakeholder/objection question cited both supplied sources. No business records were written by these provider tests.
- Repeat provider testing also produced one rejected invalid response and free-tier token-per-minute quota responses. No action was executed for these failures; spaced requests passed. [Provider metadata](evidence/ai-workbench-2026-10-17/provider-results.json) records these limits.
- A synthetic 100-opportunity scope exposed a population/sample confusion: the first model answer called five retrieved details the active total. Full-scope facts now precede retrieval details and explicitly distinguish total scope, active measured population and detailed sample. The repeated real-provider answer correctly stated 100 measured active opportunities. Context packing retained calculated facts and editable identities within the input budget (7,579 context bytes, 13 sources in that run). A larger non-packable facts block refuses locally and requests a narrower scope.
- Browser execution used fictional records and simulated cloud writers. Rescheduling preserved `fixture-plan`, its opportunity link and original creation timestamp, without duplication. Account strategy/follow-up updates reached the intended account. The unrelated Endotoxin decoy was unchanged. Receipts linked to `?date=2026-10-23`.
- Actual chat components were rendered in 1440×900 and 390×900 iframe viewports. Both showed an open catalog and visible composer without horizontal overflow. The outer screenshot wrapper uses visual scaling only to fit both complete frames; this is local responsive evidence, not a production device test.

Evidence: [fictional saved records](evidence/ai-workbench-2026-10-17/saved-fictional-records.json), [Plan receipt](evidence/ai-workbench-2026-10-17/plan-reschedule-receipt.png), [account receipt](evidence/ai-workbench-2026-10-17/plan-and-account-receipts.png), [responsive screenshot](evidence/ai-workbench-2026-10-17/desktop-mobile-catalog.png), [viewport metrics](evidence/ai-workbench-2026-10-17/responsive-metrics.json).

## Release and acceptance boundary

Release requires the final local check, exact-commit CI success, production READY, production preflight and a fresh read-only browser smoke. The release receipt records those separately after deployment. Local simulated writes and synthetic provider responses do not prove production cloud-write acceptance. No real customer writes are authorized for QA.

Chat does not send customer messages, post payments, delete/merge records, qualify leads, close Won/Lost, change Brand identity or mark Plan completion. Those remain in their canonical flows. Analytical responses remain model-generated and must preserve the supplied sample sizes, unknowns and evidence limitations.
