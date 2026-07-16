# First-User Feedback: Trust Remediation Plan

Date: 2026-07-16
Status: PLAN - grounded against the codebase; every symptom below was traced to its mechanism before planning the fix.
Source: first real user walkthrough (Today, Capture, Activity, Ask, Opportunities, Accounts, Money, Pipeline Defense, Business Review, Settings, onboarding) on a workspace with the founder-imported dataset (~122 deals, ~1,000 accounts).

## The verdict we accept

"The product has a monetizable thesis but should not commercialize yet. The problem is not missing features - it has too many features before earning trust in a single source of truth."

This matches the codebase audit: every trust-breaking symptom the user hit is real and has an identified root cause. None of them requires new modules; all of them require **unification**.

## Symptom -> root cause map (verified in code)

| # | User symptom | Verified root cause |
|---|---|---|
| 1 | VNVC in Activity + Opportunities but Account Memory says "0 active opportunities"; activities "Unlinked" | Account Memory derives counts from explicit link ids; imported activities/deals arrive unlinked and nothing reconciles by name. There is no single canonical Account-Opportunity-Activity graph - each surface resolves relationships its own way. |
| 2 | Pipeline Defense opens "Sample Pipeline Defense Brief" (Orion Pharma...) while Today shows real VNVC/Tenamyd data | `loadPipelineDefenseBriefStore()` returns the starter sample brief whenever no brief store exists - **even when the workspace has 122 real deals**. S2 (fca2064) stopped it polluting `hasMeaningfulData`, but the PD page still opens it. Worst-severity confirmed. |
| 3 | Readiness 0% (Today) vs 57% (PD) vs 119/122 weak (Opportunities) vs "under control" (Review) | Multiple metric engines: Today's readiness = `buildPipelineDefenseCenter(latestBrief.deals)` (a **brief snapshot** - possibly the sample one), Opportunities classifies **live deals**, Business Review derives its own posture. Same question, three data sources. |
| 4 | Top 3 all say "Define the next customer-confirmed action"; Review generates 865 actions | `revenueView.ts:143` fallback when `opportunity.nextAction` is empty - on an imported dataset where ~all deals lack next actions, every action gets the identical string and per-deal actions explode with N. No dedupe, no aggregation, no cap. |
| 5 | Deal drawer too long to know the first thing to do | OpportunitiesPage drawer stacks CRM form + sales flow + stakeholders + MEDDIC + objections + quotes + actions + retro + assets + activities linearly. An altitude problem (same class S3 fixed on Today). |
| 6 | English UI shows "N/Tr" units; `200.000 SGD · 4.000.000.000 SGD (Base: SGD)` | Two bugs: (a) `Intl.NumberFormat(undefined, {notation:'compact'})` uses the **browser locale** (vi-VN -> N/Tr) while UI copy is English; (b) `convertMoney(amount, currency)` converts to hard-coded `BASE_CURRENCY = 'VND'`, but `formatBaseCurrencyAmount` labels the result with `getReportingCurrency()` (SGD). The 4,000,000,000 IS VND - mislabeled as SGD. Two "base" concepts have diverged. |
| 7 | Quick Setup shows VND + "Setup applied" while Settings says SGD | Quick Setup does call `setReportingCurrency` on apply, but it re-displays **saved answers** from its own localStorage store - a second source of truth that goes stale when Settings changes later. |
| 8 | Scroll position persists across navigation; Accounts flashes 0 -> 1,000 | No scroll restoration on route change; Accounts renders its empty state before the async load resolves instead of a loading state. |

## The strategic question (founder decision - not assumed here)

The user recommends narrowing back to **Personal Pipeline Defense OS** and demoting the Business Activity OS breadth. This is exactly the scenario the pivot's own kill/keep gate anticipated: *"if they use only the pipeline surfaces, the ledger demotes back to the secondary tier and the wedge narrows again - a one-day change by design."*

- This is **n=1**. It is the first real entry for the cohort tracker (C1/C2 machinery) - strong signal, not yet a verdict.
- Everything in P0 below is **direction-agnostic**: one truth graph, one metrics engine, sample/live separation, and currency sanity are required whether the product is a wedge or an OS.
- The narrowing itself, if decided, stays the designed one-day nav-and-copy change. Recommendation: run 2-3 more cohort users through the fixed P0 build before calling it.

## Workstreams (P0 = trust before commercialization)

### T1 - Sample/live separation (P0, most severe, do first)
- Pipeline Defense **never** opens the sample starter brief when the workspace has any real deal: it offers "Generate from your N live deals" (the `generatePipelineDefenseBriefFromOpportunities` mapper already exists) as the primary action.
- The sample brief exists only in demo mode, and is visually labeled Sample everywhere it can appear.
- When the first real deal/activity arrives, the starter brief is dropped from the store (it is `isSample` since fca2064, so this is a filter, not a migration).
- Contract: with >=1 real opportunity, no surface may read from a brief with `isSample: true`.

### T2 - One metrics engine (P0)
- One classification module over **live opportunities** becomes the single source for: Today readiness, Opportunities weak/hope counts, Pipeline Defense default view, Business Review posture line.
- Briefs become what they really are: **dated snapshots**. Every brief-derived number carries "as of <date> - regenerate" so a stale snapshot can never masquerade as live state.
- Contract: fixture with known deals -> identical rescue/defend/downgrade counts on all four surfaces.

### T3 - Canonical links + Resolve Inbox (P0)
- Account Memory's "active opportunities" and every relationship count derive from one shared resolver (explicit link ids first, then normalized-name match) - the same resolver Capture suggestions already use, extracted and shared.
- The existing Capture Inbox grows into the **Resolve Inbox** the user asked for: unlinked/ambiguous records (imported activities included) in one queue, high-confidence auto-link applied and labeled, ambiguous cases one-click resolvable.
- Contract: an activity naming a known account may not render "Unlinked" while Account Memory reports 0 for that account.

### T4 - Currency & locale sanity (P0, small and high-yield)
- Kill the dual base: `convertMoney`'s default target becomes the **reporting currency** (or every caller passes it explicitly) so the converted amount and its label can never disagree. `BASE_CURRENCY` remains only the internal pivot for rate math.
- Pin `Intl.NumberFormat('en', ...)` so compact units are K/M/B, matching the English UI.
- Quick Setup displays the **live** reporting currency, not its stale saved answer; "Setup applied" states exactly what was stored.
- Contract: no rendered string combines a converted amount with the source currency's label; compact formatting is locale-stable.

### T5 - Recommendation quality + provenance (P1)
- Top 3 dedupes by action identity: identical fallback actions collapse into **one** aggregated hygiene action ("112 imported deals have no next action - fix the top 3 by value", money-ranked, deep-linking to a filtered list).
- Business Review action list is capped and money-ranked; the long tail folds behind the count.
- "Why am I seeing this?" on Top-3 items, nudges, and Ask answers: source records, dates, and the rule that fired (the data already exists in the read-models; this is exposure, not new inference).
- Contract: no two Top-3 actions may carry the same title+reason; every surfaced recommendation exposes provenance.

### T6 - First-things-first deal drawer + polish (P1)
- Deal drawer opens on a "what to do first" head (position, money, risk, next action - the commercial journey snapshot already computes this) with the CRM form/stakeholders/MEDDIC/quotes/retro sections collapsed below - same altitude treatment Today got in S3.
- Scroll resets to top on route change.
- Accounts (and any list) shows a loading state, never the empty state, before first resolve.

## Acceptance = the user's own pre-money bar

1. New user reaches the aha moment in under 10 minutes (First Week Path + fixed PD path).
2. >=95% of high-confidence auto-links correct; ambiguous ones fixable in one click (T3).
3. Zero contradictory numbers across screens (T2 contract).
4. A real pipeline review preparable in under 5 minutes from live deals (T1).
5. Every risk flag explains itself (T5 provenance).
6. Recommendations collapse from hundreds to a few ordered actions (T5).
7. Ask Memoire cites records/dates/evidence (T5 provenance applied to Ask).

## Sequencing

T1 -> T4 (small) -> T2 -> T3 -> T5 -> T6, each slice shipped with contracts + demo smoke per the standing loop. T1/T4 are days-scale; T2/T3 are the structural core of the pass; T5/T6 sharpen the differentiator the user already validated ("capture evidence -> defend forecast").

This user's feedback is also logged as cohort evidence: score them in the qualification console and count their read toward the Wave 1 stop/go criteria - today the verdict is exactly "Iterate before pricing", which is what this plan executes.
