# Memoire

**Personal Commercial Control Tower**

> From conversation to cash, nothing goes silent.

Memoire is a personal commercial control tower for complex B2B sellers. It turns every customer interaction into a continuous commercial thread - from conversation and quotation to delivery and cash - so no commitment, follow-up, or revenue opportunity goes silent.

Positioning and boundaries: [`docs/positioning.md`](docs/positioning.md). Current implemented architecture: [M28 system map](docs/architecture/memoire-final-system-map.md). Earlier product decisions: [`docs/product/focused-refactor-2026-07-26.md`](docs/product/focused-refactor-2026-07-26.md).

M12–M28 roadmap implementation and the [final development gate](docs/qa/master-roadmap-final-completion-2026-10-01.md) are complete. [Commercial Protocol v1](docs/protocol/commercial-v1.md) defines the bounded external exchange contract. Production deployment and the first seven B2B audit fixes are [verified](docs/qa/global-b2b-audit-remediation-2026-10-03.md). The [second audit](docs/qa/global-b2b-round2-audit-2026-10-04.md) records the newly found collection defects; their repair and subsequent verification are tracked [separately](docs/qa/global-b2b-round3-remediation-2026-10-04.md). Application readiness and database readiness are verified independently.

## Launch status

Single-user beta, in a free preview. The question this phase answers is whether one individual B2B seller repeatedly gets value from the core loop. The public marketing pages are indexed; everything under `/app` is not.

## The operating loop

```text
Capture → Lead → (qualify) → Account ↔ Opportunity → Money

Today   what needs attention now
Plan    who owes what, by when
Review  what changed, and what it taught
```

## Information architecture

```text
GLOBAL          + Capture · Search & Insights (Cmd/Ctrl+K, with commands) · Settings
PRIMARY         Today · Plan · Leads · Accounts · Opportunities · Money · Review
                Products & Brands · Reports · Dashboards
```

Ten approved primary destinations in this checkout and on Production. The seven commercial destinations are retained; Products & Brands, Reports and Dashboards open as separate pages following the explicit user decision on 2026-10-01. Navigation renders from `src/config/featureRegistry.ts`, and `scripts/verify-navigation-contract.mjs` checks the approved list. The live release evidence is recorded in the audit reports linked above.

- **Today** - the business picture, the three moves worth making first (money, deals, leads and captures ranked together), and a capped watch-list. Every move says what happened, why it matters and what to do.
- **Plan** (route `/app/timeline`) - Upcoming (the week, and the commitment ledger read by who owes it) and History (everything that happened).
- **Leads** - a work queue, not a list: New, Needs action, Going quiet, Ready to qualify, Nurture. Readiness is five named pieces of evidence (fit, contact, need, engagement, next move), never a score. Qualify, Nurture until a date, or Disqualify with a reason.
- **Accounts** - what matters about this customer now, then the memory behind it.
- **Opportunities** - the qualified pipeline only: its real stage, the MEDDIC evidence for it, what changed, what is blocking it.
- **Money** - Orders, Collections and Margin, opened on the money at risk between a won deal and the bank.
- **Review** - changes since the last review, the scoreboard, the week's commitments, and what leads and outcomes taught. Retains Weekly review and Learning & Analytics.
- **Products & Brands** (`/app/products`) - portfolio catalog and primary opportunity classifications.
- **Reports** (`/app/reports`) - typed custom reports, saved definitions, source inspection and export.
- **Dashboards** (`/app/dashboards`) - saved report widgets, shared portfolio filters and source drill-through.

A lead is not a second record type. It is an opportunity at the Lead stage, and qualifying it moves the stage and nothing else, so its touches, people, evidence and source are the same record in Opportunities.

## Signature mechanisms

1. **Commercial Thread** - the continuous story around one customer outcome. Derived from existing records, so a workspace that has never written one still sees its threads.
2. **Commercial Commitment Ledger** - who owes what, to whom, by when, with what impact. Three parties: I owe, the customer owes, internal owes. A rescheduled promise keeps the date it was first made.
3. **Saved by Memoire** - an optional, inline record of whether Memoire actually produced commercial value. "I would have done it anyway" is a first-class answer.

## Local core and optional AI chat

Capture parsing, prioritisation and Local insights are deterministic and computed on the user's device. No AI key is required to run or deploy Memoire. Ask Memoire also offers optional multi-turn Groq chat, deal analysis and follow-up drafts. Before sending, the user chooses to share a bounded, visible context preview and recent conversation. Source IDs are checked with the user's JWT and RLS; calculated money facts reuse the existing browser engines and are explicitly labelled as browser snapshots.

Chat is read-only. Suggested plan items require review and confirmation; drafts are copy-only. Conversations stay in page memory and clear when leaving or changing context. Groq is the only provider, with no paid-model or provider fallback. `npm run verify:no-ai` now protects the optional-AI boundary and the ability to operate without AI. See [AI chat setup and verification](docs/product/ai-chat-2026-10-16.md).

## Architecture

Opt-in automation Sprint 1 adds a saved Today brief and internal quote/commitment
reminders, configured in Settings → Automations. Its worker, migration and
scheduler requirements are documented in [Automation Sprint 1](docs/architecture/automation-sprint-one.md).
Background execution requires a deployed scheduler; saving rules alone does not verify one.

The **Commercial Kernel** (`src/domain/commercialKernel/`) holds the canonical vocabulary, the state machines, the application commands, and the deterministic policy engine.

- `types.ts` - the eight canonical concepts, the legal state transitions, and the scope object domain rules take instead of a global current user.
- `commands.ts` - the only place a kernel record changes state. Page components call commands; they do not implement transitions.
- `policyEngine.ts` - pure functions producing explainable recommendations. Every one carries a reason code, reason text, source record ids, the threshold it was judged against, severity, a recommended action, and when it was calculated. Rules never write.
- `deriveThreads.ts` - resolves threads from the workspace, so nothing had to be backfilled.

Storage is relational for records with a lifecycle (`commercial_threads`, `commercial_commitments`, `commercial_events`, `commercial_value_outcomes`) and JSON for cached projections and artifacts. Every user-owned table has `user_id`, row-level security, authenticated-only policies, revoked anonymous access, and indexes for the queries the product actually runs.

## Tech stack

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend/DB: Supabase Postgres + Auth + RLS
- Hosting: Vercel
- Payments: Lemon Squeezy (merchant of record), present but not part of the beta journey

## Local setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the Supabase values. For optional chat, set the server-only `GROQ_API_KEY` and `AI_CHAT_ENABLED=true`. Keep Groq on its Free Plan and configure its data controls. Leaving either unset keeps chat unavailable and the core app operational. `npm run dev` serves the local chat endpoint as well as the frontend.

Apply the migrations in `supabase/migrations/` in filename order.

## Verification

```bash
npm run check
```

Runs the build, the API typecheck, lint, the unit tests and the full contract suite. The unit tests alone:

```bash
npm test
```

CI runs both on every push and pull request (`.github/workflows/ci.yml`): a fast gate (build, typecheck, lint, test) and the full contract suite. Vercel build success is not a release gate on its own - it never runs any of this.

The contracts that protect the product boundaries:

- `verify:navigation` - ten approved primary destinations, every one reachable on a phone, Leads and Opportunities partition the book, no orphaned deep links.
- `verify:record-field-coverage` - every reader that rebuilds a record field by field carries every field, including the cloud reader and the save round-trip.
- `verify:commercial-kernel` - relational tables, RLS, indexes, explainable rules, threads derived not migrated.
- `verify:kernel-surface` - one thread component and one ledger across every surface.
- `verify:product-analytics` - one taxonomy in three places, five fields, no customer content.
- `verify:no-ai` - optional, consent-gated Groq chat; no browser secrets, automatic data sharing or required AI configuration.
- `verify:data-isolation` - demo records never reach a real workspace or the cloud.

## Data principles

- Local-first, cloud-synced. A seller with no connection can still record a promise.
- Export-first: everything the workspace holds comes out in one file, including the kernel records.
- Restore puts back the **browser** copy. It does not replace what is in the cloud - Settings > Sync & Recovery says so plainly.
- Raw capture is preserved.
- Demo records never sync, never export into a real workspace, and never satisfy an activation or unlock condition.
- Every user-owned table is scoped by `user_id` and protected by RLS.

## First-run path

One onboarding path, five steps, derived entirely from workspace data:

1. Capture one real customer interaction.
2. Link it to a customer.
3. Set the next commitment.
4. Come back and complete it.
5. Run the first weekly review.
