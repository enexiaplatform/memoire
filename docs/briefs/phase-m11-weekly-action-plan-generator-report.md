# Phase M.11 Weekly Action Plan Generator Report

## Files Created

- `src/utils/pipelineDefenseActionPlan.ts`
- `docs/briefs/phase-m11-weekly-action-plan-generator-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/features/pipeline/PipelineDefensePrintableBrief.tsx`

## Action Generation Rules

Phase M.11 adds a deterministic Weekly Action Plan Generator for the active Pipeline Defense Brief.

Exported helpers:

- `generatePipelineDefenseActionPlan(brief)`
- `groupActionItemsByPriority(items)`
- `generateActionPlanMarkdown(brief, items)`

Generated action items include:

- id
- deal id
- account
- opportunity
- title
- detail
- reason
- priority
- action type
- suggested owner
- suggested due timing

Priorities:

- `Critical`
- `High`
- `Medium`
- `Low`

Action types:

- `Rescue`
- `Clarify`
- `Downgrade`
- `Follow-up`
- `Collect evidence`
- `Resolve objection`
- `Prepare defense answer`

Rule examples:

- Unsupported forecast evidence creates a critical downgrade action.
- Defend recommendations with unresolved objection debt create a critical resolve-objection action.
- Missing pipeline review answer creates a critical prepare-defense-answer action.
- Missing recommended action creates a critical clarify action.
- Hope-based deals create high-priority clarification actions.
- Rescue and Downgrade recommendations create high-priority action items.
- Missing decision context creates high-priority clarification actions.
- Weak but recoverable deals create medium-priority evidence collection actions.
- Weak evidence language creates medium-priority evidence replacement actions.
- Follow-up / objection / procurement risk types create medium-priority cleanup actions.
- Defensible deals can create low-priority defense preparation actions.

## UI Behavior Added

The `/app/pipeline-defense` action bar now includes `Generate Action Plan`.

When clicked, Memoire shows a `Weekly Action Plan` panel grouped by:

- Critical
- High
- Medium
- Low

Each action item card shows:

- priority badge
- action type badge
- account / opportunity
- title
- detail
- reason
- suggested owner
- suggested due timing
- done checkbox
- `Go to deal`

`Go to deal` reuses the existing scroll helper and does not edit any deal data.

## Done State Behavior

Done state is local/session-only component state.

It is not persisted to localStorage.

Regenerating the action plan resets done state.

Deal changes, import, reset, brief switching, storage clearing, and applied rule suggestions clear the current generated action plan so stale actions do not linger.

## Copy Behavior

The panel includes `Copy Action Plan`.

When clicked, Memoire copies the generated plan as Markdown using the browser clipboard.

If clipboard access fails, the panel shows a visible Markdown textarea for manual copy.

The main Pipeline Defense Markdown export is unchanged.

## Empty State Behavior

If the active brief has zero deals, `Generate Action Plan` does not crash.

The panel shows:

`No deals available to generate action plan.`

## Print / Export Behavior

Print includes `Weekly Action Plan` only when a plan has been generated and is visible in the current session.

If no plan has been generated, print omits the action plan section.

Markdown export remains unchanged. Action plan copying is separate through `Copy Action Plan`.

## Existing Behavior Preserved

Preserved behavior:

- edit deals
- import deals
- Markdown export
- browser print / Save as PDF
- localStorage persistence
- multiple weekly briefs
- Analyze Deal
- Apply Suggestions
- Analyze All Deals
- Brief Quality Review
- empty state

## Intentionally Not Built

Phase M.11 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- AI generation
- LLM API
- calendar integration
- task integration
- heavy scoring model
- automatic deal edits
- persisted done state
- mixed-in main brief Markdown export
- full app redesign

## Manual Test

1. Open `/app/pipeline-defense`.
2. Select a brief with sample deals.
3. Click `Generate Action Plan`.
4. Confirm `Weekly Action Plan` appears.
5. Confirm action items are grouped by Critical, High, Medium, and Low.
6. Confirm each item includes account / opportunity, title, detail, reason, priority, action type, suggested owner, and suggested due timing.
7. Mark one action item as done and confirm the item changes visually.
8. Click `Copy Action Plan`.
9. Confirm copied success or fallback textarea appears.
10. Edit a deal to Unsupported, Defend, unresolved objection debt, and empty pipeline review answer.
11. Generate the action plan again and confirm critical actions appear.
12. Import CSV as Replace and generate the action plan again.
13. Confirm imported deals generate actions.
14. Remove all deals and generate the action plan.
15. Confirm the empty state appears and no crash occurs.
16. Click `Print / Save PDF`.
17. Confirm print still works and includes the action plan if generated.
18. Export Markdown and confirm existing export still works.
19. Refresh the page and confirm local persistence still works.

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
