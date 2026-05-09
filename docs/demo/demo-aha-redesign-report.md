# Memoire Phase C — Demo Aha Redesign Report

## 1. Files changed

- `src/features/v31/localStore.ts`
- `src/features/v31/TodayPage.tsx`
- `src/components/layout/OnboardingModal.tsx`
- `src/features/onboarding/guidedWorkflow.ts`
- `docs/demo/demo-aha-redesign-report.md`

Note: this work builds on the existing Phase B wedge copy already present in the app.

## 2. Demo seed changes

Updated the interactive demo workspace seed only. Henry Founder Workspace data was not changed or reintroduced.

Demo now includes 5 seeded accounts:

- Apex Pharma: proposal sent, internal review response, no scheduled follow-up after 14+ days.
- TV Pharm: VHP / SolidFog tender pending, procurement timeline unclear, no confirmed next action.
- Control Union: proposal review with Nam, lead time and local support objection, next action to send implementation timeline.
- Northstar Labs: validation proof / compliance confidence objection with no linked follow-up.
- STADA Pymepharco: healthy contrast account with recent interaction, known contact, and clear next action.

Seeded objects include accounts, contacts where known, opportunities, interactions/notes, open actions where appropriate, objections/blockers, and one processed sample capture.

## 3. First-screen aha changes

The demo Today screen now leads with:

> 3 deals may go silent today.

And the supporting line:

> Memoire found unresolved objections, missing follow-ups, and weak context in your demo accounts.

This appears before Quick Capture, so demo users receive value before typing.

## 4. Stuck deal card changes

The Stuck Deal Queue now shows the top 3 items instead of a longer queue.

Each card uses existing stuck-deal and context signals to show:

- Account / opportunity
- Why it may go silent
- Evidence
- Suggested fix
- CTAs such as Open Account, Open Opportunity, Draft Follow-up, or Add Next Action

The seeded demo should surface Apex Pharma, TV Pharm, and Northstar Labs as the clearest top risk examples.

## 5. Account Memory demo changes

The demo seed now supports the Account Memory above-the-fold risk explanation:

- Current story
- Why the deal may go silent
- Evidence
- Suggested fix
- What Memoire knows
- What Memoire does not know
- Next action where available

No missing decision maker, timeline, or contact data is invented.

## 6. Ask Memoire demo changes

Ask Memoire already supports wedge-oriented prompts from Phase B and now has demo data to answer them clearly:

- Which deals may go silent?
- Why may this deal go silent?
- What should I fix today?
- What follow-up is missing?
- What does Memoire not know?

Answers remain grounded in seeded account, opportunity, interaction, action, objection, and missing-context data.

## 7. Guided workflow changes

The interactive demo guided workflow no longer forces capture first.

New demo workflow:

1. Start with deals that may go silent.
2. Open Apex Pharma.
3. Review why it may go silent.
4. Draft a follow-up.
5. Ask Memoire why the deal may go silent.
6. Show Quick Capture as the second act.
7. Finish with the demo aha summary.

The standard non-demo workflow still supports the capture-first flow.

## 8. What was intentionally not built

- No CRM features
- No forecasting
- No win probability
- No team or manager features
- No CRM/email/calendar integrations
- No pricing UI
- No production auth changes
- No new database tables
- No Henry Founder Workspace data exposure

## 9. Build/lint result

- `npm run build`: passed.
- `npm run lint`: passed with 5 existing warnings in legacy hook files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

No new lint errors were introduced.

## 10. Remaining risks

- The interactive demo remains localStorage/demo-seed based, not a production data workspace.
- Stuck-deal ranking depends on existing Broken Loop / Context Health helper ordering; deeper ranking logic was intentionally not added.
- Guided workflow uses current app event hooks and may need visual QA after deploy to confirm timing across route transitions.
- The demo uses fictional/sample account data, including names that resemble real commercial categories; it should continue to be reviewed before external public campaigns.
