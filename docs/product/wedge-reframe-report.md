# Memoire Phase B Wedge Reframe Report

Date: 2026-05-05

## 1. Files Changed

- `src/components/marketing/HeroSection.tsx`
- `src/pages/LandingPage.tsx`
- `src/components/marketing/HowItWorksSection.tsx`
- `src/components/marketing/FeaturesSection.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/OnboardingModal.tsx`
- `src/features/settings/SettingsPage.tsx`
- `src/features/settings/BoundariesTab.tsx`
- `src/features/v31/TodayPage.tsx`
- `src/features/v31/AccountMemoryPage.tsx`
- `src/features/v31/AskMemoirePage.tsx`
- `src/features/v31/askMemoireContext.ts`
- `src/features/v31/brokenLoops.ts`
- `src/features/v31/memoryHealth.ts`
- `src/features/v31/JourneyPage.tsx`
- `src/features/v31/OpportunitiesPage.tsx`
- `src/features/v31/QuickCapturePanel.tsx`
- `src/features/v31/whatChangedDigest.ts`
- `src/features/v31/localStore.ts`
- `docs/product/wedge-reframe-report.md`

## 2. Positioning Changes

Primary wedge updated to:

> Catch deals before they go silent.

Landing subheadline updated toward:

> Memoire helps technical B2B salespeople turn scattered customer context into stuck-deal alerts, account memory, and next actions.

CRM contrast retained as supporting copy:

> Your CRM tracks the deal. Memoire remembers what needs follow-up.

Broad “Sales Memory System” language was softened on the primary public surface.

## 3. User-Facing Terminology Changes

Reframed primary labels:

- `Broken Loop` -> `Stuck Deal`, `Deal at Risk`, or `Stuck-deal signal`
- `No next action` -> `Missing follow-up`
- `Open objection has no follow-up` -> `Unresolved objection`
- `Account/opportunity has gone stale` -> `Account going silent`
- `Memory Health` -> `Context Health`
- `Sales Memory Loop` -> `Memory-to-Action flow`

Internal helper names remain where changing them would add risk without user-facing value.

## 4. Today / Stuck Deal Queue Changes

Today now opens with the wedge:

- Header: `Catch deals before they go silent.`
- Top daily section: `Deals that may go silent`
- Demo focus line: `3 deals may go silent today.`

The new Stuck Deal Queue uses existing data only:

- broken loop detection
- Context Health signals
- open actions
- accounts
- opportunities

Each stuck deal card shows:

- Account / Opportunity
- Why it may go silent
- Evidence
- Suggested fix
- CTA: Open Account, Draft Follow-up, Add Next Action, Ask Memoire

Existing Top Revenue Actions, Due / Overdue Actions, Quick Capture, What Changed, and Sales Pattern remain below the wedge section.

## 5. Account Memory Changes

Account Memory above the fold now makes silent-deal risk explicit:

- Current story
- Why this deal may go silent
- Evidence
- Suggested fix
- What Memoire knows
- What Memoire does not know
- Next Action

If an account has enough context:

> This account has a clear next action and enough context for now.

No missing data is invented. Missing context is still derived from existing interactions, actions, objections, contacts, and opportunity context.

## 6. Ask Memoire Changes

Ask presets now prioritize stuck-deal questions.

All Deals:

- Which deals may go silent?
- Which accounts need follow-up?
- Which objections are unresolved?
- What should I fix today?
- What changed recently?

Account:

- Why might this account go silent?
- What follow-up is missing?
- What does Memoire know?
- What does Memoire not know?
- What should I do next?

Opportunity:

- Why is this deal stuck?
- What is the next action?
- What context is missing?
- Draft follow-up

Answers are more structured around:

- Account
- Issue
- Evidence
- Suggested fix
- Missing context
- Next action

Attention-style All Deals prompts now return deterministic stuck-deal items from existing helpers instead of generic responses.

## 7. Demo Workspace Changes

Demo data was reframed as fictional sample accounts only.

The demo now includes:

- `Apex Pharma`: unresolved objection / procurement timing pending
- `Helio Diagnostics`: account going silent after an old first meeting
- `Orion MedTech`: overdue follow-up
- `Meridian Bio`: missing decision maker / decision timeline context
- `Northstar Labs`: healthy account with clear next action

This gives value immediately on Today before the user captures a new note.

Quick Capture remains available as the second act:

> Now see how a new customer note becomes part of the queue.

## 8. Landing Page Changes

Hero:

- `Catch deals before they go silent.`
- Technical B2B sales ICP added.
- CRM contrast moved to supporting line.

Problem section now emphasizes:

- deals going silent
- forgotten follow-ups
- unresolved objections
- scattered customer context
- CRM fields not telling the account story

Feature section now focuses on:

1. Stuck Deal Queue
2. Account Memory
3. Ask with Context
4. Follow-up from Memory

“Learning Layer” was removed from primary feature copy because it is not the proven wedge.

## 9. What Was Intentionally Not Built

Not built:

- CRM features
- forecasting
- win probability
- team or manager features
- CRM sync
- email/calendar integration
- pricing UI
- new data model
- new major product surface
- platform expansion

This sprint only reframed existing surfaces, copy, demo emphasis, and deterministic helper usage.

## 10. Build / Lint Result

Build:

- `npm run build` passed after implementation.
- Existing Vite large chunk warning remains.

Lint:

- `npm run lint` passed with 0 errors.
- 5 existing legacy hook warnings remain unrelated to this sprint.

## 11. Remaining Product Risks

- “Deals that may go silent” is now clearer, but external testers must confirm it is immediately understandable.
- Some internal helper names still use older language; this is acceptable unless it leaks to UI.
- Date formatting remains unchanged from prior phase.
- Exact duplicate stuck-deal dedupe remains basic.
- Real Supabase credential login remains pending Henry/manual verification from Phase A.
