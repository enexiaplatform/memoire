# Memoire Phase H — Email Thread Capture Prototype Report

## 1. Files changed

- `src/types/v31.ts`
- `src/features/v31/salesMemory.ts`
- `src/features/v31/QuickCapturePanel.tsx`
- `src/features/v31/followUpComposer.ts`
- `docs/product/email-thread-capture-prototype-report.md`

## 2. Capture mode selector

Quick Capture now has a lightweight capture type selector:

- Quick Note
- Email Thread

Default mode is Quick Note.

When Email Thread is selected:

- the placeholder changes to email-thread copy
- helper copy explains what Memoire will extract
- the structure button changes to `Structure Email Thread`
- a demo email thread can be inserted for validation

No Gmail OAuth, inbox sync, or email integration was added.

## 3. Email extraction behavior

Email Thread capture uses a conservative paste-based heuristic parser.

It extracts where available:

- account name
- contact / sender
- email subject
- thread summary
- current status
- customer concern / objection
- suggested next action
- follow-up timing phrase where simple
- missing context
- stuck-deal risk

Rules:

- If account is not explicit, it remains missing.
- If contact/sender is not explicit, it remains missing.
- Decision maker is not invented.
- Decision timeline is not invented.
- Vague timing remains represented as missing or tentative context.

## 4. Structured preview changes

Email Thread preview now shows:

- Source type: Email Thread
- Account
- Contact / Sender
- Subject
- Thread Summary
- Current Status
- Customer Concern
- Concern / Objection
- Suggested Next Action
- Stuck Risk
- Missing Fields
- Raw email preserved

Quick Note preview remains unchanged except for sharing the same capture surface.

## 5. Save behavior

Saving an Email Thread uses the existing Sales Memory save flow.

It can update:

- Account Memory
- email interaction / thread note
- opportunity context
- objection / customer concern
- next action when explicit
- Ask Memoire context
- Stuck Deal Queue signals through existing missing-follow-up / objection logic

Raw email text is preserved as the raw note.

No duplicate-account system was added beyond the existing account-name matching and upsert behavior.

## 6. Post-save feedback

After saving an Email Thread, the confirmation says:

> Saved email thread to Account Memory.

It shows:

- Added to Account Memory
- Added thread summary
- Updated customer concerns
- Created or linked next action
- Updated stuck-deal signal
- Ask Memoire can now use this context
- Missing context

CTAs:

- Open Account Memory
- View Next Action
- Ask about this Account
- Draft Follow-up
- Capture another thread

## 7. Demo example

Added one demo Email Thread example:

Subject:

`Re: Control Union proposal review`

Email body:

```text
Hi Henry,
Thanks for sending the proposal. We are reviewing internally. Our main concerns are lead time and local support. Could you send a clearer implementation timeline next week?

Regards,
Nam
```

Expected extraction:

- Account: Control Union
- Contact: Nam
- Status: proposal under internal review
- Concern: lead time and local support
- Next action: send a clearer implementation timeline next week
- Missing: decision maker, decision timeline
- Stuck risk: may go silent if the concern is not addressed with a clear follow-up

## 8. What was intentionally not built

- No Gmail OAuth
- No inbox sync
- No calendar integration
- No CRM integration
- No transcript integration
- No voice capture
- No email sending
- No team or manager features
- No forecasting
- No win probability
- No pricing UI
- No core data model migration

## 9. Build/lint result

- `npm run build`: passed.
- `npm run lint`: passed with 5 existing warnings in legacy hook files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

No new lint errors were introduced.

## 10. Remaining risks

- Email extraction is heuristic and intentionally conservative.
- Account/contact extraction improves when existing account/contact names are already in memory.
- The prototype validates pasted email context only; it does not prove OAuth or inbox sync is worth building.
- Follow-up timing phrases may still need product review before becoming hard due dates in real workflows.
- Add Next Action is still handled through existing capture save behavior, not a standalone action creation UI.
