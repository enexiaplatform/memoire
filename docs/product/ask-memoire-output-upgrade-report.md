# Memoire Phase E — Ask Memoire Output Upgrade Report

## 1. Files changed

- `src/types/v31.ts`
- `src/features/v31/askMemoireContext.ts`
- `src/features/v31/AskMemoirePage.tsx`
- `docs/product/ask-memoire-output-upgrade-report.md`

## 2. Presets added/updated

Updated Ask Memoire presets around the stuck-deal wedge.

All Deals:

- Which deals may go silent?
- Which accounts need follow-up?
- Which objections are unresolved?
- What should I fix today?
- Which deals are missing next actions?
- What changed recently?

Account:

- Why may this account go silent?
- What happened last time?
- What does Memoire know?
- What does Memoire not know?
- What should I do next?

Opportunity:

- Why is this deal stuck?
- What is blocking this opportunity?
- What follow-up is missing?
- What context is missing?
- What should I do next?

Action / fix prompts:

- Draft a follow-up
- How should I address this objection?
- What should I ask the customer next?

## 3. Answer card formats implemented

Added structured answer card support to `AskMemoireAnswer`.

Implemented card types:

- Stuck Deal Card
- Account Answer Card
- Opportunity Answer Card
- Follow-up Suggestion Card

Cards display grounded fields such as:

- Account / opportunity
- Issue
- Why it may go silent
- Evidence
- Missing context
- Suggested fix
- Next action
- Draft follow-up text where relevant

Raw structured text remains available behind a collapsible “Structured text” section when a card is rendered.

## 4. CTA behavior

Supported CTAs inside cards:

- Open Account
- Open Opportunity
- Draft Follow-up
- Capture Update

Notes:

- Draft Follow-up links to Account Memory, where the existing follow-up composer is already supported.
- Open Opportunity currently links to the existing Opportunities page because there is no dedicated opportunity detail route in this scope.
- Add Next Action was not implemented because there is no standalone action creation flow currently supported.

## 5. Grounding / missing context behavior

Every card keeps grounding visible through:

- Based on / Context used
- Missing context
- Evidence fields
- “Memoire does not know yet” style fallback copy

Rules preserved:

- No invented decision maker.
- No invented decision timeline.
- No invented budget.
- No invented competitor.
- No invented contact.
- Missing context is shown instead of guessed.

## 6. All Memory routing changes

All Deals attention prompts continue to use deterministic local signals:

- Stuck Deal Queue
- unresolved objections
- missing follow-ups
- accounts/deals going silent
- missing next actions
- Context Health

The ranked result now renders as Stuck Deal Cards instead of only raw text.

## 7. Demo support

Interactive demo prompts now have stronger structured output support:

- Which deals may go silent?
- Why may Apex Pharma go silent?
- What should I fix today?
- What does Memoire not know about Northstar Foods?
- Draft a follow-up for Orion Pharma

The output is grounded in seeded demo accounts, opportunities, interactions, actions, and objections.

## 8. What was intentionally not built

- No CRM features
- No forecasting
- No win probability
- No deal scoring
- No team or manager workflows
- No CRM sync
- No email/calendar integration
- No pricing UI
- No generic AI coaching
- No sentiment analysis
- No new chatbot platform behavior

## 9. Build/lint result

- `npm run build`: passed.
- `npm run lint`: passed with 5 existing warnings in legacy hook files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

No new lint errors were introduced.

## 10. Remaining risks

- Opportunity CTA points to the Opportunities list because there is no dedicated Opportunity Detail page.
- Follow-up CTA routes to Account Memory rather than opening the composer directly from Ask Memoire.
- Card generation is deterministic and template-based; it is intentionally conservative.
- Visual QA should confirm card density is comfortable on mobile.
