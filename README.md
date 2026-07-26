# Memoire

**Personal Commercial Control Tower**

> From conversation to cash, nothing goes silent.

Memoire is a personal commercial control tower for complex B2B sellers. It turns every customer interaction into a continuous commercial thread - from conversation and quotation to delivery and cash - so no commitment, follow-up, or revenue opportunity goes silent.

Positioning and boundaries: [`docs/positioning.md`](docs/positioning.md). Current architecture and the decisions behind it: [`docs/product/focused-refactor-2026-07-26.md`](docs/product/focused-refactor-2026-07-26.md).

## Launch status

Single-user private beta. The question this phase answers is whether one individual B2B seller repeatedly gets value from the core loop. Search indexing stays disabled until that is answered.

## The operating loop

```text
Capture → Commercial Thread → Commitment → Silence and Risk → Today → Review → Measured Commercial Value
```

## Information architecture

```text
GLOBAL          + Capture · Search & Insights · Settings
PRIMARY         Today · Accounts · Opportunities · Money · Timeline · Review
```

Six primary destinations. There is no seventh: navigation renders from `src/config/featureRegistry.ts`, and `scripts/verify-navigation-contract.mjs` fails the build if that changes.

- **Today** - what must be done, what is overdue, which threads are going silent, what was captured but not yet linked.
- **Accounts** - who the customer is, what happened, who the stakeholders are, what is open.
- **Opportunities** - the commercial objective, its real stage, the evidence for it, what is blocking it.
- **Money** - where commercial value is sitting: quote, customer decision, PO, delivery, invoice, paid, and what is stuck.
- **Timeline** - Upcoming (open commitments and dated work) and History (everything that happened).
- **Review** - the weekly loop, the Pipeline Defense artifact, and analytics.

## Signature mechanisms

1. **Commercial Thread** - the continuous story around one customer outcome. Derived from existing records, so a workspace that has never written one still sees its threads.
2. **Commercial Commitment Ledger** - who owes what, to whom, by when, with what impact. Three parties: I owe, the customer owes, internal owes. A rescheduled promise keeps the date it was first made.
3. **Saved by Memoire** - an optional, inline record of whether Memoire actually produced commercial value. "I would have done it anyway" is a first-class answer.

## No AI dependency

Capture parsing, prioritisation, search, and every recommendation are deterministic and computed on the user's device. Nothing is sent to an AI service, no AI SDK is installed, and no AI key is required to run or deploy Memoire.

This is a trust differentiator, not the promise. `npm run verify:no-ai` fails the build if an AI SDK, endpoint, or key placeholder is reintroduced, and `/api/health` reports a warning if an AI key is present in the environment.

## Architecture

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
- Payments: Stripe, present but not part of the beta journey

## Local setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in the Supabase values. There are deliberately no AI keys to set.

Apply the migrations in `supabase/migrations/` in filename order.

## Verification

```bash
npm run check
```

Runs the build, the API typecheck, lint, and the full contract suite. Unit tests run separately:

```bash
npm test
```

CI runs both on every push and pull request (`.github/workflows/ci.yml`): a fast gate (build, typecheck, lint, test) and the full contract suite. Vercel build success is not a release gate on its own - it never runs any of this.

The contracts that protect the product boundaries:

- `verify:navigation` - six primary destinations, three global actions, no orphaned deep links.
- `verify:commercial-kernel` - relational tables, RLS, indexes, explainable rules, threads derived not migrated.
- `verify:kernel-surface` - one thread component and one ledger across every surface.
- `verify:product-analytics` - one taxonomy in three places, five fields, no customer content.
- `verify:no-ai` - no AI SDK, endpoint, key, or health requirement.
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
