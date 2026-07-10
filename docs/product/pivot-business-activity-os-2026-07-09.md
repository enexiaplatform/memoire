# PIVOT: Memoire Business Activity OS

Date: 2026-07-09
Status: FOUNDER DECISION - supersedes the wedge-only framing in `product-strategy-gtm-2026-07-02.md` Section 2 and updates `docs/positioning.md`. All other strategy machinery (evidence gates, cohort plan, contract discipline) remains in force.

## The decision

Memoire pivots from "Personal Pipeline Defense OS" (pipeline review as the center) to **Business Activity OS** (the seller-operator's whole commercial motion as the center). Pipeline Defense does not disappear - it becomes the premium review output inside a larger operating loop.

New positioning one-liner:

> Memoire is a personal Business Activity OS for B2B sellers and solo operators: capture every commercial activity, see where the money sits, and never let anything go silent - deals, quotes, deliveries, payments, or follow-ups.

The silence wedge is retained and **generalized**: it no longer protects only deals. "Going silent" now applies to the whole commercial motion.

## Why now (and the counter-argument, on the record)

The engineering counsel was to hold this pivot until cohort Wave 1 evidence (see `docs/memoire-product-review.md`). The founder overruled: the product must match how he and the target umbrella persona actually operate - a day is a stream of commercial activities (meetings, quotes, deliveries, payments, content, experiments), not only pipeline deals. Running Wave 1 on a framing the founder no longer believes in would produce evidence about the wrong product. Accepted trade-off: Wave 1 now tests the broader positioning, and the pivot is built to be reversible (see Hard Rule 3).

## Three hard rules (what keeps this from becoming a generic productivity app)

1. **The money-spine rule.** Every surface, insight, and activity must connect to commercial motion: activity -> money state -> next action. A feature that cannot name the money it moves or protects does not ship. This is the line between "Business Activity OS" and "second brain" - Memoire tracks the business, not the person.
2. **One product, one voice - no persona modes.** The proposed Sales Rep / Solo Business / Founder modes are rejected: they triple copy, QA, and support surface for a one-person team with zero evidence. The umbrella persona stays "people who sell and run their own commercial motion without a team". The pivot widens WHAT they track, not WHO they are.
3. **Derive, don't migrate.** New concepts (business domains, ledger views) are derived deterministically from existing records. No schema changes, no cloud-table changes, no data migration in Phases 1-2. If Wave 1 evidence says the OS framing fails, demotion back to the pipeline wedge is a navigation-and-copy change, not a data unwind.

## The new core loop

Any commercial activity -> quick capture -> **Activity Ledger** (the spine: one timeline of everything, classified by business domain) -> linked entities (account / opportunity / quote / initiative) -> money & silence state -> risk + next action -> **Weekly Business Review** (Pipeline Defense Brief is its premium artifact) -> outcomes -> measured learning (silence ROI, objection playbook, forecast calibration).

## Business domains (the ledger's classification axis)

Derived (never stored) from activity type, tags, and keywords:

- **Sales** - meetings, follow-ups, demos, objections, partnerships
- **Money** - quotes, tenders, POs, invoices, payments
- **Delivery** - fulfillment, installation, project delivery
- **Marketing** - content, campaigns, outreach
- **Product** - build work, product/SaaS operations
- **Learning** - research, experiments, market learning
- **Internal** - coordination, admin

## Information architecture (Phase 1)

Primary tier, renamed **"Business Activity OS"** (7): Today, Capture, **Activity** (new - the ledger at `/app/activity`, upgraded from the calendar surface; `/app/calendar` stays as an alias), Pipeline Defense, Opportunities, Accounts, Ask Memoire.

Review & Learn tier (6): Weekly Brief (becomes Weekly Business Review in Phase 2), **Money** (the revenue view, promoted from hidden), Stakeholders, Objections, Playbook, Assets.

Nav contract count moves 12 -> 14 (7 + 6 + founder import). The seven nav-guard scripts are updated deliberately, in the same change.

## Phasing

- **Phase 1 (SHIPPED 2026-07-09):** strategy docs, Activity Ledger with domain filters, expanded activity taxonomy + capture templates (payment, delivery, partnership, content, product, learning), nav + brand label, landing repositioning, demo data for non-sales activities.
- **Phase 2 (SHIPPED 2026-07-09):** Weekly Brief -> Weekly Business Review (`buildWeeklyBusinessReview`: money lanes, wins/losses, stalled initiatives, next-week priorities; Pipeline Defense Brief stays the manager-facing artifact on its own surface). Today opens with the business cockpit strip answering the five questions: what moves money today / which deals are hot / which follow-ups are late / which initiative is stuck / what needs capturing (`buildBusinessCockpit`). Initiative-stalled detection (`classifyInitiativeHealth`, 14-day quiet threshold + overdue-step) feeds a new `initiative` nudge source; money-stuck was already covered by revenue nudges.
- **Phase 3 (SHIPPED 2026-07-09, founder-directed ahead of the cohort gate):** unified money-flow thread (`buildMoneyFlow`: deal -> quote -> PO -> delivery -> payment, stuck detection from fulfillment checkpoints + expired validity, quote-covered deals never double count) rendered as lanes on the Money page; offer/experiment as first-class initiative types; Ask Memoire answers "Where is the money?" and "What happened this week?" from measured data (money flow lanes + ledger domains). Contract: `verify-business-os-deep-loop`.

## Kill / keep criteria (the pivot's own evidence gate)

After cohort Wave 1: if participants engage with the ledger + business review (capture non-deal activities, open Activity weekly), the OS framing holds and Phase 3 unlocks. If they use only the pipeline surfaces, the ledger demotes back to the secondary tier and the wedge narrows again - a one-day change by design.

## Explicitly rejected from the proposal

- Persona/workspace modes (Hard Rule 2).
- "Capture what happened, track what matters, know what to do next" as positioning - too generic; the money-spine version above keeps the loss-aversion edge.
- A separate Projects module - initiatives stay on the existing `OperatingContext` foundation until Phase 3 evidence.
- Invoicing, accounting, task management, CRM sync: still anti-positions.
