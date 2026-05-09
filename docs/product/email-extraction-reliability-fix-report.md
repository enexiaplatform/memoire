# Memoire Phase I.1 — Email Extraction Reliability Fix Report

## 1. Files changed

- `src/types/v31.ts`
- `src/features/v31/salesMemory.ts`
- `src/features/v31/QuickCapturePanel.tsx`
- `src/features/v31/localStore.ts`
- `src/features/v31/brokenLoops.ts`
- `docs/product/email-extraction-reliability-fix-report.md`

## 2. Ghost / no-response detection changes

Added detection for ghost / no-response patterns in pasted email threads.

Detected phrases include:

- no response
- no reply
- has not replied
- has not responded
- went quiet
- gone quiet
- silent
- no update
- unanswered
- follow-up unanswered
- still waiting
- waiting for response
- no feedback yet
- no reply for X days/weeks
- no response for X days/weeks

When detected, Email Thread Capture now classifies the issue as:

> No response / Account going silent

Suggested fix:

> Send re-engagement follow-up, confirm status, and ask for decision timeline.

The stuck risk is saved into structured data and picked up by Broken Loop detection, so it can surface in Account Memory, Stuck Deal Queue, and Ask Memoire context.

## 3. Missing-context alignment changes

Pre-save Structured Preview and post-save feedback now use the same shared evaluator:

- `getMissingInteractionFields(structured)`

The old post-save-only enrichment logic was removed.

Minimum checks now include:

- account
- contact / sender
- interaction summary
- next action
- due date when a next action exists
- decision maker
- decision timeline
- opportunity context for deal-related captures
- blocker / objection when a stuck risk exists

This prevents the preview from saying “No important fields missing” while post-save later flags decision maker or decision timeline.

## 4. Decision-maker extraction changes

Email extraction now detects explicit decision-maker language such as:

- final decision maker
- decision maker
- approver
- approval owner
- budget owner
- PO sign-off
- procurement approver
- committee chair
- evaluation lead
- technical approver
- validation manager
- finance director
- purchasing manager
- final approver
- responsible for approval

Extracted fields:

- `decision_maker_name`
- `decision_maker_role`
- `decision_context`
- `secondary_contact`

If the decision maker is not the sender, the primary contact is not overwritten. The person is stored as decision context / secondary contact in structured data.

## 5. Multi-objection preservation changes

Email extraction now preserves enumerated technical blockers from:

- numbered lists
- bullet lists
- semicolon-separated issue lists
- “following issues”
- “following concerns”
- “three concerns”

Examples preserved as separate lines:

- IQ/OQ/PQ validation documentation
- sensor calibration drift specification
- on-site service SLA coverage

Save behavior now splits structured objection text by line or semicolon and creates separate objection records where possible.

Local demo save and Supabase save both support this split.

## 6. Tender/procurement risk changes

Added tender/procurement stuck-risk detection for:

- tender pending
- procurement timeline unclear
- committee review
- evaluation period extended
- no confirmable timeline
- notification by end of month
- budget approval pending
- purchasing committee
- internal review

Classified issue:

> Tender/procurement may go silent

Suggested fix:

> Confirm evaluation timeline, decision criteria, next communication date, and decision owner.

Missing context can include:

- decision committee
- decision criteria
- procurement timeline
- competing vendors
- budget approval status

## 7. Email preview copy changes

Email Thread mode already displayed:

> Paste a customer email thread or selected email messages here...

The preview now includes additional email-specific fields:

- Decision Maker
- Decision Role
- Decision Context
- Secondary Contact
- Stuck Risk
- Raw email preserved

## 8. Regression cases tested

Manual regression coverage was added/documented for these scenarios:

### 1. Control Union

Input:

- proposal under review
- lead time / local support concern

Expected:

- concern extracted
- next action extracted
- decision maker and decision timeline shown as missing pre-save and post-save

### 2. Meditec Asia

Input:

- tender pending
- committee review
- unclear timeline

Expected:

- tender/procurement risk detected
- decision committee / criteria / timeline missing
- stuck risk appears in broken-loop logic

### 3. BioGen Instruments

Input:

- numbered technical blockers:
  - IQ/OQ/PQ documentation
  - sensor calibration drift specification
  - on-site service SLA

Expected:

- each blocker preserved as separate objection line
- save creates separate objection records where possible
- vague collapsed “technical concerns” output avoided

### 4. PharmaTec Manufacturing

Input:

- no response for 3 weeks
- went quiet after positive response

Expected:

- ghost/no-response signal detected
- issue classified as Account going silent
- suggested re-engagement follow-up
- stuck risk available to Stuck Deal Queue / Ask Memoire

### 5. Syntec Diagnostics

Input:

- explicit decision maker
- clear demo date
- healthy next action

Expected:

- decision maker extracted
- decision role/context stored
- no false missing decision maker
- low stuck risk unless another risk phrase appears

## 9. Build/lint result

- `npm run build`: passed.
- `npm run lint`: passed with 5 existing warnings in legacy hook files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

No new lint errors were introduced.

## 10. Remaining risks

- Extraction is still heuristic and paste-based.
- Decision timeline extraction is conservative and may still miss complex phrasing.
- The app stores decision context in structured capture data rather than a dedicated database column.
- Stuck-deal detection now catches email risk signals, but ranking quality still depends on existing Broken Loop ordering.
- Gmail OAuth, inbox sync, and background email processing remain intentionally out of scope.
