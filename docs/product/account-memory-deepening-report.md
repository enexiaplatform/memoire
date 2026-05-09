# Memoire Phase D — Account Memory Deepening Report

## 1. Files changed

- `src/features/v31/AccountMemoryPage.tsx`
- `docs/product/account-memory-deepening-report.md`

## 2. Account Memory layout changes

Account Memory now has a stronger above-the-fold decision layer for fast recall before follow-up.

The top area now shows:

- Account name
- Context Health / Account Health
- Main opportunity
- Main next action
- Current story
- Why the account may go silent
- Evidence
- Suggested fix
- What Memoire knows
- What Memoire does not know

Existing supporting sections remain available lower on the page.

## 3. Current Story changes

The “Current story” section now appears inside the first decision layer.

It uses the existing account narrative helper and only reflects available:

- account summary
- opportunity context
- latest interaction
- open actions
- captured blockers / objections

No decision maker, decision timeline, budget, competitor, or contact is invented.

## 4. Why This May Go Silent changes

The page now explains risk in plain language using existing signals from:

- Broken Loop detection
- Context Health
- open objections
- missing follow-up
- stale / weak context
- missing decision context

Healthy accounts show:

> This account has a clear next action and enough context for now.

## 5. Evidence section changes

Evidence now appears as concise bullets, including available items such as:

- Last interaction
- Open objection
- No open next action found
- Open next action
- Missing context
- Source note

The page favors evidence over vague claims.

## 6. Suggested Fix changes

Suggested fix is now elevated above the old detail sections.

It uses conservative logic:

- Use existing Broken Loop suggested fix first.
- If decision timeline is missing, suggest asking for decision timeline.
- If decision maker is missing, suggest confirming decision owner.
- If no next action exists, suggest creating one before the account goes quiet.
- If lead time is the blocker, suggest addressing it with an implementation timeline.

Supported CTAs:

- Draft Follow-up
- Ask Memoire
- Capture Update

No unsupported Add Next Action workflow was added.

## 7. What Memoire Knows / Does Not Know changes

The page now separates known context from missing context.

Known context can include:

- Main contact
- Current opportunity
- Known objection
- Last interaction
- Open next action
- Product / opportunity context

Missing context can include:

- Decision maker
- Decision timeline
- Recent interaction
- Clear next action
- Contact
- Opportunity

Combined missing decision context is split into decision maker and decision timeline for clearer user understanding.

## 8. Healthy account state

Healthy accounts no longer look falsely risky.

When the account has enough context and a clear next action, the risk section shows an “on track” style message:

> This account has a clear next action and enough context for now.

The suggested action becomes lightweight:

> Review the next action or ask Memoire if you want a quick recap before following up.

## 9. What was intentionally not built

- No CRM dashboard features
- No forecasting
- No win probability
- No manager/team views
- No CRM sync
- No email/calendar integration
- No pricing UI
- No new major page
- No data model change
- No invented account facts

## 10. Build/lint result

- `npm run build`: passed.
- `npm run lint`: passed with 5 existing warnings in legacy hook files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

No new lint errors were introduced.

## 11. Remaining risks

- The suggested-fix logic is intentionally conservative and template-based.
- “Add Next Action” was not added because there is no clearly supported standalone action creation flow in this scope.
- Visual QA should confirm the above-the-fold layer feels compact enough on smaller screens.
- Evidence quality depends on whether the account has captured interactions, objections, and actions.
