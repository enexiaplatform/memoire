# Memoire Product Review - Current State Audit

Date: 2026-07-09
Purpose: evidence-backed answer to the "rethink Memoire as a focused product" review request, so completed work is never re-audited or re-implemented from scratch. Read this BEFORE proposing positioning, IA, or core-loop changes.

Authoritative strategy sources (this document does not replace them):
- `docs/positioning.md` - positioning, target users, non-goals
- `docs/product/product-strategy-gtm-2026-07-02.md` - GTM plan, IA 5+1, evidence gates
- `docs/product/commercial-readiness-audit-2026-07-04.md` - uniqueness verdict, funnel status
- `docs/product/silence-roi-learning-loop-2026-07-09.md` and `docs/product/forecast-calibration-insight-answers-2026-07-09.md` - latest deep-loop waves

## The core loop (already the product's spine)

Capture -> structured sales memory -> opportunity context -> risk / next action -> pipeline review -> Pipeline Defense Brief -> action & deal outcomes -> measured learning (silence ROI, objection playbook, forecast calibration) -> better decisions.

Every stage is shipped and contract-guarded. The loop closes twice: outcomes feed the next day's actions (Today), and outcomes recalibrate the seller's own judgment (Pipeline Defense).

## Review checklist vs. reality

1. **Positioning clear?** Yes. Wedge "Catch deals before they go silent" shipped 2026-05-05 (`wedge-reframe-report.md`); CRM contrast is the hero subtext and FAQ. Forbidden generic-CRM claims are contract-tested (`verify-product-positioning-demo-path`).
2. **Homepage/demo explain value quickly?** Yes. Landing leads with the wedge; demo sandbox opens on Today with a critical "Deal going silent" nudge out of the box; the Demo Journey card is a 4-step "5-minute path to the Pipeline Defense aha moment" (contract-guarded step ids).
3. **Sales Memory OS, not generic CRM?** Yes by design: primary nav is branded "Pipeline Defense OS"; Quotes/Revenue/Calendar/Journey/Operating System were demoted from navigation on 2026-07-02 (routes preserved for deep links). Nav is contract-locked at 12 entries.
4. **Quick Capture easy and prominent?** Yes: #2 in primary navigation, 30-second quick mode with templates, email-thread paste mode, existing-account autocomplete, and browser-local voice dictation on both note and quick modes.
5. **Opportunity pages show memory/risk/context/next action?** Yes: silence state per row ("Quiet Nd - no next action"), Going-silent filter chip, MEDDIC stakeholder map, forecast evidence category, commercial panel, Draft-follow-up on quiet rows.
6. **Pipeline Review strong enough to be the habit?** Yes and instrumented: weekly Review Packs, Pipeline Review Habit card, Weekly Brief with activity timeline and the per-period "Saved from silence" impact panel.
7. **Pipeline Defense Brief visible as signature output?** Yes: primary nav destination, printable brief, share-ready markdown (now including Saved From Silence evidence), manager summary copy, review pack history, and the personal forecast calibration panel.
8. **Features to demote?** Already done (see 3). Remaining demotions are explicitly cohort-evidence-gated per the GTM doc - do not demote further on intuition.
9. **New user understands in 5 minutes?** The demo path proves capture -> memory -> risk -> review -> brief in 4 guided steps; runtime-smoked repeatedly (see wave docs).
10. **Now vs later?** Sequenced in the GTM doc: P0 evidence gates (founder env actions) -> cohort Wave 1 -> paid early access. Feature building beyond the deep loop is intentionally frozen until cohort evidence.

## What Memoire does well (verdict unchanged from 2026-07-04 audit)

The silence loop is the moat and it is now closed end-to-end **with proof**: detection -> prefilled composer -> log as sent -> book next touch -> measured ROI ("Saved from silence" on Today/Weekly/Brief) -> actionable waiting queue. The learning layer (objection playbook, outcome insights, forecast calibration) turns accumulated memory into switching cost. Ask Memoire answers deterministic history questions from measured data with "no AI involved".

## What was actually unclear or stale (fixed in this pass)

- Landing copy for "Outcome Learning" and the "Learn from outcomes" step predated the calibration and silence-ROI waves; refreshed to describe the shipped behavior (personal win-rate calibration, revived-deal evidence). No positioning change, no new claims beyond shipped behavior.

## What we intentionally did NOT change

- No renaming, no nav changes, no route changes: 5+1 IA is contract-locked and correct.
- No new audit of auth/demo/CSV/review-packs/request-access: all flows are contract-covered and were not touched.
- No new features: the anti-breadth gate holds until cohort evidence.
- No AI claims added anywhere; the newest surfaces explicitly say "no AI involved" where true.

## Standing guidance for future "product rethink" requests

Before acting on any broad improvement prompt: (1) read the strategy sources above, (2) diff the request against this checklist, (3) implement only the residual gaps, (4) never bypass `npm run check` - 47 contract scripts encode the product's positioning, IA, honesty rules, and demo path.
