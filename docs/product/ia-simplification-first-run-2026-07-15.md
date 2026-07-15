# IA Simplification & First-Run Polish

Date: 2026-07-15
Status: FOUNDER FEEDBACK -> EXECUTION PLAN. Operates strictly inside the canonical direction (`commercial-os-direction-2026-07-09.md`); no positioning change.

## The feedback (founder, 2026-07-15)

1. The sidebar is cluttered ("menu hiện tại đang bị rối") - 14 items across two tiers reads as a wall, wants it tidy but not over-engineered.
2. The app's features are good but HEAVY: a new customer does not know what to do or where to start. Wants a strong optimization + polishing pass, full authority granted, but the original meaning of the app (money-spine operating loop) must be preserved.

## Diagnosis (audited against the code, 2026-07-15)

- **Nav**: primary tier mixes three different kinds of surface - the daily loop (Today/Capture/Activity/Ask), entity lookups (Opportunities/Accounts), and a review artifact (Pipeline Defense). That category mixing, not the raw count, is what reads as clutter. The pivot doc already says Pipeline Defense "becomes the premium review output inside a larger operating loop" - the nav never caught up.
- **First-run**: an empty workspace renders `ForecastDefenseReadiness` scaffolding plus `TodayCommandEmptyState` with 5 competing CTAs plus a quick-setup box - up to 6 choices before the customer has captured anything. The operating loop has exactly one correct first step (capture one activity); the UI should say so.
- **Active-user Today** is already tiered (10 visible sections, ~18 more behind "Supporting execution detail") - heavy but organized; polish is ordering and copy, not surgery.

## Principles (unchanged, binding)

- Money-spine: every surface still connects activity -> money state -> next action.
- Demote, don't delete: no route is removed; count stays 14; everything stays reachable.
- No new data entry demanded; derive-don't-migrate; honest empty states.
- Not over-engineered: each slice is a nav-and-copy change, reversible in a day.

## Slices

### S1 - Nav regroup: three tiers that mirror the loop (this change)

- **Business Activity OS** (the daily loop): Today, Capture, Activity, Ask Memoire.
- **Pipeline & Money** (where the money sits): Opportunities, Accounts, Money.
- **Review & Learn** (existing collapse + first-brief unlock, unchanged): Business Review, Pipeline Defense, Stakeholders, Objections, Playbook, Assets (+ founder-only Import Review).

Pipeline Defense moves to Review & Learn per the pivot's own framing (premium review artifact). Money moves up beside the entities it explains (money-spine rule). Route count stays 14; the seven-plus nav guards are updated deliberately in the same commit (`verify-today-command-center` nav order).

Reach-safety: Pipeline Defense stays reachable pre-unlock via Today's Pipeline Review Readiness section, the first-review CTA, and the empty-state path; visiting it expands the tier (existing `hasActiveSecondaryRoute` rule).

### S2 - One start path for an empty workspace

Empty Today shows ONE primary action (quick setup when never run, else capture the first activity), demo sandbox as the single secondary, everything else drops. `ForecastDefenseReadiness` scaffolding is suppressed until the workspace has meaningful data. The trial checklist stays where it is (Review setup) - the empty state links to it instead of duplicating CTAs.

### S3 - Today altitude for active users

Keep cockpit-first opening. Re-check the visible-section order against "action or information": nudges and top-3 actions stay high; measured-history panels (FollowUpImpact) move lower or fold into Supporting execution detail. Measured by deep-loop funnel events - no removal, only reordering/folding. Ship only what a glance justifies.

### S4 - Copy & empty-state consistency sweep

One voice pass over section headers and empty states: every card leads with the action, one CTA per card, honest empty states everywhere (`verify-ui-text-polish` extended as needed).

## Add-on features (only if a gap remains after S1-S4)

Candidate list is deliberately empty for now. The activation checklist, quick setup, demo sandbox, and guided first-review already exist - the problem is arrangement, not missing features. If cohort feedback after this pass still shows "don't know where to start", the next candidate is a single derived "First Week Path" strip on Today (state-derived, no new data entry), which folds away permanently once the loop is running.

## Evidence

Each slice ships with contract updates in the same commit and a demo-sandbox smoke. Success signal for the pass: funnel events show first-capture and first-review conversion improving in cohort Wave 1; kill criterion: if the regrouped nav confuses demo users worse (verbal feedback), revert is a one-commit nav-and-copy change.
