# IA Consolidation: Navigation 5+1 Refactor

Date: 2026-07-02
Strategy source: `docs/product/product-strategy-gtm-2026-07-02.md` (Section 3)

## Change

The app sidebar moved from 5 primary + 12 "More tools" items (17 visible modules) to the 5+1 model:

Primary ("Pipeline Defense OS"):

- Today
- Capture
- Pipeline Defense
- Opportunities
- Accounts
- Ask Memoire (promoted from the secondary tier; it is a core V1 screen)

Secondary tier, renamed "More tools" -> "Review & Learn":

- Weekly Brief
- Stakeholders
- Objections
- Playbook
- Assets

Removed from customer navigation (routes remain live for deep links and in-app handoffs):

- Operating System
- Revenue
- Quotes
- Sales Setup (`/app/onboarding/sales-operating-setup`)
- Calendar
- Journey

The founder-only Import Review entry is unchanged and still gated by `isFounderImportUser`.

## Rationale

- The V1 promise is five screens; the shipped nav exposed ~18 routed modules. The customer journey audit flagged the secondary breadth as a pre-habit risk.
- Quotes/Revenue as top-level destinations pull the product toward "business management app", an explicit anti-position. In-page commercial handoff links (Pipeline Defense -> Quotes/Revenue) are preserved.
- Journey/Operating System/Sales Setup are onboarding or founder surfaces, not daily-loop destinations.

## Contract coverage updates

- Seven verify scripts guarded the sidebar at exactly 18 `to: '/app/` entries; the guard value is now 12 (6 primary + 5 secondary + 1 founder import). Scripts: `verify-account-hygiene`, `verify-meddic-stakeholder-map`, `verify-pipeline-defense-center`, `verify-proactive-nudges`, `verify-product-positioning-demo-path`, `verify-today-command-center`, `verify-win-loss-learning`.
- `verify-accessibility-failure-state-contract` marker updated from `More tools` to `Review & Learn`.
- `verify-commercial-operating-loop-contract` still requires the Weekly Brief sidebar entry; it remains present.

## Verification

- `npm run check` passed (full contract suite).
- `npm run build` passed.
- Runtime smoke (local dev server, public demo sandbox -> `/app/today`): primary nav renders Today, Capture, Pipeline Defense, Opportunities, Accounts, Ask Memoire; "Review & Learn" expands to Weekly Brief, Stakeholders, Objections, Playbook, Assets; Settings remains pinned; no console errors.

## Progressive disclosure (added later on 2026-07-02)

The Review & Learn tier now unlocks after the first value moment, per strategy Section 3.4:

- Locked state (new signed-in workspace, no saved artifacts): the sidebar shows a quiet hint — "Review & Learn unlocks after your first saved brief." — instead of the collapsible section.
- Unlock conditions: any saved Pipeline Defense Brief or Review Pack in the workspace, demo mode (sample data includes briefs), an already-active secondary route (deep links are never blocked), or founder import mode.
- Routes are never gated; only navigation visibility changes.
- Contract coverage added to `scripts/verify-activation-workflow-contract.mjs` (first-saved-brief check, locked hint copy, and the exact unlock condition expression).
- Demo completion copy on the Demo Journey card now uses the loss-aversion framing from strategy Section 5.2: "Your demo work stays in this browser only - your real pipeline deserves an account that syncs safely."
- Verified: `npm run check` passed; runtime smoke confirms demo mode shows the Review & Learn tier with no locked hint and no console errors. The locked state is covered by contract markers because it requires a fresh authenticated workspace, which the local smoke path cannot reach.

## Calendar merge into Weekly Brief (added later on 2026-07-02)

The Weekly Brief page now includes an Activity Timeline panel: every recorded customer touch in the selected review period, grouped by day, showing summary, activity type, linked account, and the captured next action. An "Open full calendar" link keeps the full `/app/calendar` surface reachable from the merged page even though it is hidden from primary navigation. Verified with `npm run check`, `npm run build`, and a demo-sandbox runtime smoke (timeline renders 5 demo activities grouped by day on `/app/weekly-brief`, calendar link present, no console errors).

## Quotes/Revenue fold status (confirmed 2026-07-02)

The Opportunity detail view already contains `OpportunityCommercialPanel`: per-opportunity quote status, Quotes / Active / Pending PO / At risk metrics, the top quote with its next action, and entry links to the quote workspace and revenue view. The strategy's fold requirement is therefore already satisfied at the content level; the standalone `/app/quotes` and `/app/revenue` routes stay reachable through in-context links while hidden from primary navigation.

## Pre-cohort completion state

As of 2026-07-02, every IA-consolidation item actionable without cohort evidence is complete: 5+1 navigation, Ask Memoire promoted, Review & Learn progressive disclosure, Calendar timeline merged into Weekly Brief, and Quotes/Revenue folded into Opportunity detail. The remaining decisions are explicitly evidence-gated:

- Retire `/app/calendar`, `/app/quotes`, `/app/revenue` fully — decide from cohort usage.
- Later unlock steps per strategy Section 3.4 (Playbook/Objections surfacing after review cadence forms).
- Silence-risk threshold tuning (7/14 days) from cohort interviews.

## Polish pass additions (2026-07-02, later)

- Weekly Brief now links to the full activity calendar ("Open activity calendar") beside the recap actions, keeping `/app/calendar` discoverable after leaving primary navigation. Verified in the demo sandbox with no console errors.
- Accessibility: shared Modal gained a focus trap, focus restore, and dialog semantics; a shared `useEscapeToClose` hook now backs Escape-to-close on all ad-hoc overlays (Follow-up Composer, guided-workflow welcome, demo confirms, brief preview, quote drawer, activity detail); an audit confirmed zero icon-only buttons remain without `aria-label`/`title` after fixing six unlabeled close buttons (Accounts, Assets, Objections, Opportunities x2, Stakeholders). Full detail in `docs/qa/accessibility-failure-state-qa-2026-06-17.md`.
- Mobile polish for the Opportunities master table: the Pick and Account columns are now sticky during horizontal scroll (solid backgrounds, group-hover sync, border divider), so the seller never loses which deal a row belongs to inside the 2040px-wide table. Verified on a 375px viewport in the demo sandbox: cells report `position: sticky`, hold their left offset after a 600px scroll, and show no console errors.
