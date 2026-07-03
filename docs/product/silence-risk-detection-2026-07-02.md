# Silence-Risk Detection: First-Class Wedge Signal

Date: 2026-07-02
Strategy source: `docs/product/product-strategy-gtm-2026-07-02.md` (Sections 2.1, 5.2)

## Problem

The flagship promise is "Catch deals before they go silent," but no first-class detector existed for it. The proactive nudge engine fired only when a next action was already overdue; an Active opportunity with **no scheduled next action and no recent customer touch** — the canonical going-silent deal — produced no alert. Silence-adjacent logic existed only as scattered 14-day checks inside account hygiene and opportunity quality reviews.

## Change

`buildSilenceRiskNudges` added to `src/utils/proactiveNudges.ts` and wired into `buildProactiveNudges`:

- Scope: Active opportunities with **no valid scheduled next action date**. Deals with an overdue next action are excluded — the existing "Next action overdue" nudge owns that case, so silence never double-fires.
- Last touch: the newest valid activity date linked to the opportunity by `linkedOpportunityId`, or matching the opportunity's account by `accountName`/`linkedAccountName` (case-insensitive). Falls back to the opportunity's created date when no touch exists.
- Thresholds: 7+ quiet days → "Silence risk" (high). 14+ quiet days → "Deal going silent" (critical).
- Copy: the reason names the last-touch date (stable nudge identity, so a dismissal holds until a new touch or next action changes the state). The recommended action reuses the seller's own planned `nextAction` text when present ("Put a date on the planned next action: …"), otherwise "Book the next customer touch or send the follow-up now, before this deal goes quiet."
- Nudges surface through the existing Today Proactive Nudges UI, urgency sorting, snooze/dismiss persistence, and the 5-item cap. No UI changes were needed.

## Demo data

The Summit Diagnostics "QC workflow" sample story (Downgrade, no confirmed next step, Dormant account) now has its last touch, stakeholder interaction, and downgrade outcome dated 16 days back instead of 4, so the public demo — the primary acquisition path — visibly demonstrates the wedge: Today shows a critical "Deal going silent" nudge for Summit Diagnostics out of the box.

## Contract coverage

`scripts/verify-proactive-nudges.mjs` extended with behavioral fixtures:

- 14+ quiet days, no scheduled next action → critical "Deal going silent" naming the last-touch date and reusing the planned next action.
- Untouched opportunity 8 days after creation → high "Silence risk" with created-date fallback copy.
- Touch within 7 days → no silence nudge.
- Scheduled future next action → no silence nudge.
- Overdue next action → "Next action overdue" only, no silence double-fire.

## Verification

- `npm run check` passed (full contract suite, including the extended proactive-nudges contract).
- `npm run build` passed.
- Runtime smoke (dev server, fresh demo sandbox): `/app/today` shows "Deal going silent — Summit Diagnostics / QC workflow — No customer touch since Jun 16, 2026 and no next action is scheduled"; no console errors.

## Opportunities rollup (added later on 2026-07-02)

The silence classifier was extracted as a shared export `classifyOpportunitySilence` in `src/utils/proactiveNudges.ts` (single source of truth for the nudge engine and list surfaces) and wired into the Opportunities page:

- Each row's "Last touch" cell now shows `Quiet Nd - no next action` in red (silent, 14+ days) or amber (at-risk, 7+ days) instead of the plain last-touch date.
- A "Going silent (N)" quick-filter chip shows the live count of quiet deals across the pipeline and filters the table to them.
- Contract coverage extended in `scripts/verify-proactive-nudges.mjs`: classifier state assertions (silent / at-risk / quiet-ok / planned / inactive) plus UI markers for the chip and quiet cell.
- Verified: `npm run check` and `npm run build` passed; runtime smoke on the demo sandbox shows "Going silent (1)", the Summit Diagnostics row marked "Quiet 16d - no next action", and the chip filtering the table to that single row with no console errors.

## Detection-to-action loop (added 2026-07-03)

Silence detection now closes the loop from signal to action. Opportunity-sourced nudge cards on Today (including "Deal going silent" / "Silence risk") carry a primary **"Draft follow-up"** button that opens the Follow-up Composer prefilled from the flagged deal:

- Account, opportunity, and decision-maker resolved from the nudge's linked opportunity (by `entityId`, with a name-match fallback).
- Last interaction summary and pain points pulled from the deal's most recent activities (linked by opportunity id or account name).
- Goal preset to `revive_stale_deal`, tone `consultative`, length `medium`.

Verified end-to-end in the demo sandbox: the Summit Diagnostics "Deal going silent" card opens the composer with the right account and preset goal, generates a draft, and closes on Escape — no console errors; `npm run check` passes.

The same action ships on the Opportunities master table: quiet rows (red/amber "Quiet Nd" cells) show a "Draft follow-up" button that opens the composer without triggering the row's detail panel. Context building is shared through `src/utils/followUpFromOpportunity.ts` (`buildReviveFollowUpContext`), so Today and Opportunities stay consistent. Verified in the demo sandbox: the Summit Diagnostics quiet row opens the prefilled composer (revive_stale_deal / consultative / medium) and Escape closes it, no console errors.

## Follow-ups

- Threshold tuning (7/14 days) should be revisited with cohort evidence; long-cycle consultants may want wider windows.
