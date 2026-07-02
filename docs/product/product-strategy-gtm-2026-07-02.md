# Memoire Product Strategy & Go-To-Market Plan

Date: 2026-07-02
Status: Strategy baseline for GTM preparation
Owner: Henry (founder-operator)
Supersedes nothing; synthesizes: `positioning.md`, `commercialization-roadmap-2026-06-16.md`, `solo-operator-persona-expansion-2026-07-01.md`, `customer-journey-audit-2026-06-15.md`, `commercial-release-gate-2026-06-16.md`.

---

## 1. Executive Summary

Memoire is a personal Sales Memory System for people who sell without a sales team. The product is functionally complete for its wedge, has strong trust/QA infrastructure, and is blocked from market primarily by (a) operational evidence gates (two-account QA, production monitoring), (b) an information architecture that has outgrown its V1 promise, and (c) an unvalidated pricing hypothesis.

This document defines four workstreams to reach GTM:

1. **Product strategy** — freeze the wedge, cut surface area, ship the cohort.
2. **Information architecture** — collapse ~18 app modules into the 5-screen V1 promise plus one "More" tier.
3. **UI/UX** — one first-run path, one activation moment (saved Pipeline Defense Brief / Review Pack), visible data-trust status.
4. **Value model** — one paid early-access offer (Solo, $19/mo hypothesis to be validated), checkout gated behind B1–B6.

Target sequence: Controlled cohort (Wave 1, weeks 1–3) → Paid early access (weeks 4–8) → Public selling decision (week 9+).

---

## 2. Product Truth & Strategic Position

### 2.1 What Memoire is

- Personal Sales Memory System + Daily Sales Action Engine for solo sellers.
- Wedge: **"Catch deals before they go silent."**
- Contrast: *Your CRM or spreadsheet tracks the record. Memoire remembers the story and what needs follow-up.*
- Core loop: Capture → Structure → Memory → Opportunity → Action → Ask → Learning.

### 2.2 Target market (per 2026-07-01 persona decision)

Umbrella persona: **people who sell without a sales team** — individual B2B sellers, founder-led sellers, consultants, freelancers, agency owners, creators selling client work/partnerships/sponsorships.

Explicit non-market: teams, managers, ecommerce/marketplace operators, invoicing/delivery management, transactional C2C.

### 2.3 Strategic bets

| Bet | Rationale | Risk if wrong |
|---|---|---|
| Solo sellers will pay for *memory + follow-up safety*, not another CRM | CRM fatigue is the #1 stated pain; the demo-to-Pipeline-Defense path is the strongest observed journey | Product reads as "CRM-lite" and loses to free spreadsheets |
| The Pipeline Defense Brief / Review Pack is the activation moment | Journey audit shows this path converts attention into a saved artifact | If solo operators (no manager) don't value "review-ready," activation framing must shift to "don't lose the deal" |
| One person, one workspace, no team features for V1–V2 | Keeps scope, trust model, and support burden solo-sized | Slower expansion revenue; acceptable at this stage |

### 2.4 Product development priorities (next 90 days)

Priority order is unchanged from the commercialization principle: **Trust → Value → Activation → Evidence → Monetization → Scale.**

1. **Close the P0 evidence gates** (no new features until done): production `/api/health` proof, deployed rate-limit 429 proof, two-account isolation QA on production/preview, auth-recovery QA on the deployed domain, monitoring for API errors / AI spend / failed cloud writes / lead submissions, legal review for the real selling jurisdiction.
2. **Ship the IA consolidation** (Section 3) — this is product work that directly serves activation, not polish.
3. **Run cohort Wave 1** (Section 5) and synthesize willingness-to-pay evidence.
4. **Decide the single paid offer** (Section 4) and run billing QA (B1–B6) in Stripe test mode.
5. Only after paid evidence: solo-operator demo pack, capture prompts for retainers/sponsorships, deeper Ask Memoire.

**Do-not-build list (reaffirmed):** team workspace, manager dashboards, CRM sync/integrations, invoicing, delivery/project management, email/calendar sync, proposal generation, forecasting.

---

## 3. Information Architecture & Content Strategy

### 3.1 The problem

The V1 promise is five screens (Today, Vault/Accounts, Pipeline/Opportunities, Ask Memoire, Settings/Export). The shipped app exposes ~18 routed modules: Today, Capture, Calendar, Weekly Brief, Reviews, Playbook, Assets, Journey, Accounts, Opportunities, Quotes, Revenue, Stakeholders, Objections, Pipeline Defense, Ask, Imports, Settings. The journey audit already flagged that "seven secondary modules may be too broad before the core weekly-review habit is established."

Every extra module before habit formation dilutes the wedge, increases first-session confusion, and multiplies QA/support surface at exactly the moment the team is one person.

### 3.2 Target IA: 5 + 1 model

**Primary navigation (always visible):**

| Screen | Absorbs | Job |
|---|---|---|
| **Today** | Capture entry, due/overdue actions, stuck-deal alerts | "What do I do right now?" |
| **Accounts** (Vault) | Contacts, Stakeholders, account-level interactions, objections in account context | "What do I know about this buyer?" |
| **Pipeline** (Opportunities) | Pipeline Defense Brief, Review Packs, Quotes/Revenue as opportunity fields not top-level pages | "Which deals are at risk and why?" |
| **Ask Memoire** | Search (already redirected) | "Answer from my own memory." |
| **Settings / Export** | Imports, data mode, billing, legal | "My data is mine." |

**Secondary tier — one "Review & Learn" area (collapsed by default):** Weekly Review (merge Weekly Brief + Reviews + Calendar recap), Playbook, Assets, Objections ledger, Journey. These unlock progressively (see 3.4), not on day one.

**Cut or fold immediately:**
- `Quotes` and `Revenue` as top-level routes → fields/sections inside an Opportunity. Standalone revenue views pull the product toward "business management app," an explicit anti-position.
- `Calendar` as a page → a recap block inside Weekly Review.
- `Journey`, `Operating System`, `Demo Guide` → hide from customer nav; keep behind founder mode or onboarding replay only.
- Legacy redirects (deals, entities, history, search) already exist — keep, add nothing new to them.

### 3.3 Content structure principles

1. **Every screen answers one seller question** (table above). If a screen can't be named by its question, it doesn't get navigation.
2. **The artifact hierarchy is: Capture (raw, preserved) → Structured record (editable) → Memory (account/opportunity) → Brief (review-ready story).** Public copy, onboarding, and empty states should teach exactly this hierarchy and nothing else.
3. **Data-trust copy is content, not chrome.** "Where is this stored / will it sync / what if I clear my browser" stays persistent and plain-language (already built; preserve through the IA refactor).
4. **Public site content mirrors the persona decision:** headline stays on stuck deals; eyebrow broadens to "B2B and solo operators"; "Not a CRM" section mentions spreadsheets and private notes; "not ideal for" copy stays explicit.

### 3.4 Progressive disclosure schedule

- Day 0: Today + one first-run choice (import CSV / add one opportunity / try demo).
- After first saved Brief/Review Pack: unlock Weekly Review prompt.
- After 2 weekly reviews or 10 captures: surface Playbook + Objections ledger ("your patterns are forming").
- Assets/proof vault: surfaced when a user first shares or exports a brief.

This turns the existing feature breadth from a liability into a retention ladder.

---

## 4. Value Model & Pricing

### 4.1 Value proposition per segment

| Segment | Acute pain | Memoire value statement |
|---|---|---|
| Individual B2B seller | Deals go silent between CRM updates; manager reviews are stressful | Stuck-deal alerts + a defensible Pipeline Defense Brief in minutes |
| Founder-led seller | Sales memory lives in one overloaded head | Account memory + Today actions without CRM overhead |
| Consultant / freelancer / agency owner | Long-cycle proposals with no follow-up system | Never miss the follow-up that closes the retainer |
| Creator / expert | Sponsorship & partnership threads scattered across DMs/email | One place that remembers every partner conversation and next step |

The **unit of value is a saved, review-ready deal story plus the follow-ups that prevented silence** — not seats, not contacts, not storage.

### 4.2 Packaging decision (Session 9 input)

Move from the current hypothesis menu (Solo $15–25, Pro $29–49, Team n/a) to **one paid early-access offer**:

- **Memoire Solo — $19/month or $190/year (hypothesis to validate in cohort)**
  - Full core loop: capture, structure, account memory, opportunities, Today actions, Ask Memoire, Pipeline Defense Briefs, Review Packs, CSV import, export.
  - Fair-use AI limits (rate limits already enforced server-side); plain-language cap in the offer copy.
  - Early-access pledge: price locked 12 months, export-first, cancel anytime, 14-day refund.
- **Pro** becomes a "coming later" note (deeper history, advanced exports), not a purchasable tier. Do not maintain two SKUs before one is proven.
- **Team** stays explicitly out of scope on the pricing page (already true).

Validation gate: at least 3 cohort members state a specific willingness-to-pay at or above $15/mo, and at least 1 completes a real Stripe test-mode checkout, before enabling `BILLING_CHECKOUT_ENABLED=true`.

### 4.3 Pricing tests to run in cohort interviews

1. Anchor question: "What does one lost deal cost you?" (value framing vs tool framing).
2. Van Westendorp-lite: too cheap / fair / expensive / too expensive at $9 / $19 / $29 / $49.
3. Annual-first test: does "$190/yr, price locked" convert better than monthly for solo operators with lumpy income?
4. Segment split: do consultants/agencies tolerate higher price than individual reps? (Informs later Pro tier, not current SKU.)

### 4.4 Monetization guardrails

- Checkout stays behind B1–B6 (billing QA, support runbook filled, refund/trial policy, one test support case) — no exceptions.
- AI cost per active user must be measured in the weekly operating review before public selling; price must cover worst-decile AI usage with margin.
- No discount-driven acquisition in early access; the lever is the price-lock pledge.

---

## 5. UI/UX Optimization Plan

### 5.1 First-run experience (activation)

Keep the audited recommendation as the contract:

1. **One first-run choice:** Import CSV / Add one opportunity / Try demo. Nothing else visible.
2. **One contextual checklist** that ends at a saved Pipeline Defense Brief or Review Pack — this is the single "activated" definition, measured by the existing `pipeline_defense_brief_created` and review-pack-save events.
3. **Hide every other onboarding system** after the first value moment (guided workflow stays replayable from Settings only).

Solo-operator adjustment: the brief must be framed as valuable *to yourself* ("your deal story, defensible to anyone — a client, a partner, future you"), not only "manager-ready." Track in cohort whether solo operators understand the value without the manager framing (open question from the persona note).

### 5.2 Demo → account conversion path

- The demo remains the primary acquisition experience (strongest journey per audit). Keep it focused: weak signals → Pipeline Defense Brief → save/copy Review Pack → create account.
- Demo completion CTA already routes to signup; add one line of loss-aversion copy: "Your demo work stays in this browser. Your real pipeline deserves an account."
- Solo-operator demo pack (Northstar Advisory, Studio Lane, Creator Partnerships, Agency implementation) ships **after** cohort Wave 1, only if solo-operator signups exceed ~40% of intake.

### 5.3 Trust surfaces (preserve, do not regress)

- Persistent data-mode status (demo-browser / browser-only / cloud+browser / sync-issue) in top nav.
- AI disclosure near every AI-assisted feature; structured output always editable before save; raw capture always preserved.
- Export & delete self-service prominent in Settings.
- These are conversion features for this persona, not compliance chores — keep `verify:trust-boundary` and `verify:data-isolation` green through all IA changes.

### 5.4 UX debt to clear before public selling (from existing gates)

- Full keyboard/focus/modal/mobile accessibility matrix on production or preview (C6).
- Slow-network and failure-state behavior for capture, structure, and brief-save.
- Reduce `More tools` breadth per Section 3 (this closes the audit's open medium-priority item).
- Change-email self-service (P2, post-launch acceptable).

### 5.5 Public content surfaces

- Landing: keep wedge headline; broaden audience bullets per persona note; keep "Not a CRM" and "not ideal for" sections.
- Pricing: replace the two-range hypothesis with the single Solo offer + pledge once Session 9 is decided; until then, keep hypothesis labeling honest (current state is correct).
- Keep noindex until the public-selling go decision; SEO/content marketing is a post-launch workstream, not a launch dependency.

---

## 6. Go-To-Market Plan

### 6.1 Phase 0 — Gate closure (now → ~2 weeks)

Exit: all P0 blockers evidenced in `cohort-release-evidence-packet`, decision flips from HOLD.

- Production health, rate-limit, auth-recovery, client-log evidence on the deployed domain.
- Two-account isolation QA on production/preview.
- Monitoring + weekly operating review #1 saved under `docs/operations/weekly-reviews/`.
- Legal review for the selling jurisdiction.
- IA consolidation (Section 3.2 cuts) shipped and smoke-tested — do this while gates are being evidenced.

### 6.2 Phase 1 — Controlled cohort, Wave 1 (weeks 1–3, free)

- 8–12 hand-picked users from the `early_access_requests` queue: mix of individual B2B sellers and solo operators (target ≥3 solo operators to test the persona expansion).
- Support cadence, interview script, feedback tracker: already exist (`cohort-validation-system`, outreach templates) — execute as written.
- Success metrics (per user): imported or created ≥3 opportunities; saved ≥1 Pipeline Defense Brief; returned in week 2; answered pricing interview.
- Stop/go: if <50% reach a saved brief without founder hand-holding, fix activation before Wave 2 — do not widen the funnel.

### 6.3 Phase 2 — Paid early access (weeks 4–8)

- Decide the Solo offer (Section 4.2) from Wave 1 evidence; fill billing runbook; run Stripe test-mode QA; flip `BILLING_CHECKOUT_ENABLED=true`.
- Wave 2: 25–50 users. Sources, in order of leverage for a solo founder:
  1. Direct outreach to the request-access queue (warm, already exists).
  2. Founder-led content: 2–3 posts/week on LinkedIn + X telling stuck-deal stories and showing the Brief artifact ("build in public" with real review packs, anonymized).
  3. Communities where solo sellers already are: indie-hacker, consultant, and agency-owner communities; freelance platforms' off-platform discussion spaces. Give the Pipeline Defense Brief away as a framework (content), sell the memory system (product).
  4. A shareable artifact loop: every exported/shared Review Pack carries a tasteful "Prepared with Memoire" footer — the product's output is its own distribution.
- North-star metric: **weekly returning users who save a brief** (habit), guardrail: activation rate ≥50%, AI cost/user within margin.

### 6.4 Phase 3 — Public selling decision (week 9+)

- Re-run the release gate (Session 11). Inputs: ≥5 paying users, first churn/refund signals, support load per user, weekly operating reviews #1–#6.
- If go: remove noindex, publish pricing without "hypothesis" framing, start the SEO/content engine (stuck-deal and follow-up-system keywords; the docs/research capture frameworks are seed content).
- If no-go: continue paid early access; revisit monthly via the weekly operating review.

### 6.5 GTM risks & mitigations

| Risk | Signal | Mitigation |
|---|---|---|
| Solo operators don't resonate with "manager-ready" framing | Wave 1 interviews | Reframe activation copy to "deal story for future you"; already planned in 5.1 |
| Product read as CRM-lite | "How is this different from HubSpot free?" objections | Lead every surface with memory + silence-prevention, never with pipeline records |
| AI cost outruns $19 price | Weekly AI-spend review | Fair-use caps already enforced; adjust limits before adjusting price |
| One-person support can't handle paid users | Support runbook test case | Cap Wave 2 at 50; keep refund policy generous to buy goodwill |
| Feature breadth confuses first sessions | Activation rate <50% | Section 3 IA consolidation is the primary fix; measure before/after |

---

## 7. Operating Cadence & Ownership

- **Weekly operating review** (template exists): funnel, activation, revenue, support, errors, AI cost, one decision. Non-negotiable once cohort starts.
- **Backlog policy:** requests that strengthen the core loop → product work; persona-adjacent requests (invoicing, projects, teams) → rejected with the positioning note as the written reason; one-off needs → manual/founder-handled.
- **Session protocol** (unchanged): each work session advances one coherent 5–10% slice and leaves an artifact.

### Immediate next actions (in order)

1. Evidence the P0 production gates (health, rate limits, auth recovery, monitoring) on the deployed domain.
2. Run two-account isolation QA on production/preview and record it in the evidence packet.
3. Ship the IA consolidation: fold Quotes/Revenue into Opportunities, merge Weekly Brief + Reviews + Calendar into one Review area, hide Journey/Operating System from customer nav.
4. Invite cohort Wave 1 from the request-access queue (only after 1–2 flip the gate from HOLD).
5. Run pricing interviews per Section 4.3; write the Session 9 pricing decision note.
6. Fill the billing runbook, run Stripe test-mode QA, then enable checkout for the single Solo offer.
