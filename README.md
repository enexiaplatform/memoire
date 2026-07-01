# Memoire

Memoire is a Career Knowledge Vault + Daily Sales Action Engine for people who sell without a sales team: individual B2B sellers, founder-led sellers, consultants, freelancers, agency owners, and solo operators managing their own client or customer pipeline.

Core statement:

> Your CRM, spreadsheet, or notes track the record. Memoire helps you remember context, catch deals before they go silent, prepare follow-ups, and build review-ready deal stories.

## Launch Status

Memoire is currently an intentional private beta. Public routes explain the product and support demo and access-request flows, while search indexing remains disabled until checkout, onboarding, and launch QA are complete.

## Brand System

The Memoire brand guide and machine-readable tokens live in `docs/brand/`. The canonical identity is the Outfit ExtraBold gradient wordmark, supported by the navy and brand-blue product palette.

## V1 Scope

The V1 product flow is:

Quick Capture -> Structure -> Today Actions -> Account Memory -> Ask Memoire

The V1 screens are:

- Today
- Vault / Accounts
- Pipeline / Opportunities
- Ask Memoire
- Settings / Export

V1 intentionally does not include manager dashboards, team workspaces, CRM integrations, advanced analytics, email/calendar sync, proposal generation, complex automation, invoicing, inventory, ecommerce, marketplace, or project-delivery management.

## V1 Data Model

Required core tables:

- `accounts`
- `contacts`
- `opportunities`
- `interactions`
- `actions`
- `captures` for preserved raw notes

Future concepts such as signals, assets, deals, learnings, and playbooks are prepared for conceptually but not built into the V1 surface.

## Tech Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend/DB: Supabase Postgres + Auth + RLS
- Hosting: Vercel
- AI: Claude API primary, Groq/OpenAI-compatible fallback where configured, OpenAI embeddings for existing vector search
- Payments: Stripe exists in the codebase but is not central to the immediate V1 MVP

## Local Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and provide Supabase, AI, and Stripe values as needed.

Run Supabase migrations in order, including:

```text
supabase/migrations/005_master_plan_v31_core.sql
```

## Data Principles

- Cloud-first
- Export-first
- Privacy-first
- User-owned sales memory
- Raw capture is preserved
- AI-structured output is editable before saving
- Every user-owned table is scoped by `user_id` and protected by RLS

## Verification

```bash
npm run build
npm run lint
```

Current note: the app builds successfully. Lint still reports pre-existing strict TypeScript/React rule violations in legacy modules that are now hidden from the V1 navigation.

## V1 QA Checklist

Sample capture:

> Just called Alex at Northstar Foods. They are still reviewing the proposal. Main concerns are lead time and service support. I should follow up next Tuesday and offer a short meeting to clarify.

Expected structured fields:

- Type: call
- Account: Northstar Foods
- Contact: Nam
- Opportunity: proposal review or equivalent proposal-related title
- Interaction summary: Alex / Northstar Foods is still reviewing the proposal
- Pain point: lead time and service support
- Objection / blocker: lead time and service support
- Next action: follow up next Tuesday and offer a short meeting
- Follow-up date: the next Tuesday after the test date

Expected records after save:

- Raw note remains in `captures`
- Account memory exists for Northstar Foods
- Contact exists for Alex and links to Northstar Foods
- Interaction links to the Northstar Foods account
- Opportunity links to Northstar Foods when the structured opportunity title is present
- Today action is created from the next action

Manual test flow:

- Quick Capture: open `/app/today`, paste the sample capture, click Structure, review/edit the structured output, then save it.
- Today Actions: confirm the saved follow-up appears as an open action and that due/overdue sections load without errors.
- Account Memory: open `/app/accounts`, select Northstar Foods, and confirm the account shows contacts, latest interactions, pain points, objections, opportunities, and open actions.
- Opportunity Basic: open `/app/opportunities` and confirm the proposal opportunity shows account, stage, blocker, next action, last touch, urgency, and confidence. Confirm opportunities without next actions are highlighted.
- Ask Memoire: open `/app/ask` and try "Who should I follow up today?", "Summarize this account.", and "What happened last time with this customer?"

Dogfood regression check:

- Save the same sample capture twice.
- Confirm Memoire does not create two clearly duplicate active opportunities for Northstar Foods.
- Confirm both interactions remain preserved as memory.
