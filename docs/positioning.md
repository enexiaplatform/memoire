# Memoire Positioning

Updated: 2026-07-26. Supersedes the Business Activity OS framing of 2026-07-09 (`docs/product/pivot-business-activity-os-2026-07-09.md`), which is kept as history.

## Category

**Personal Commercial Control Tower**

## Promise

> From conversation to cash, nothing goes silent.

## Expanded positioning

Memoire is a personal commercial control tower for complex B2B sellers. It turns every customer interaction into a continuous commercial thread - from conversation and quotation to delivery and cash - so no commitment, follow-up, or revenue opportunity goes silent.

## Core contrast

Your CRM tracks records for the company. Memoire keeps your commercial threads moving.

## The operating loop

```text
Capture
→ Commercial Thread
→ Commitment
→ Silence and Risk
→ Today
→ Review
→ Measured Commercial Value
```

## Signature mechanisms

1. **Commercial Thread** - the continuous commercial story around one customer outcome: conversation, follow-up, technical evaluation, quote, customer commitment, PO, delivery, payment, post-sale commitment.
2. **Commercial Commitment Ledger** - who owes what, to whom, in which commercial context, by when, and with what impact. Three parties: I owe, the customer owes, internal owes.
3. **Saved by Memoire** - a lightweight record of whether Memoire actually produced commercial value, so the product's worth is measured rather than asserted.

## The hypothesis being validated

A seller running their own complex B2B commercial motion will repeatedly use Memoire if they only need to record commercial information once, and Memoire reliably helps them recover context, keep commitments, and act before a commercial thread goes silent.

Three behaviours, in order:

1. **Record once** - capture a commercial event once, without re-entering it across modules.
2. **Recover context** - understand quickly what happened, what is being waited on, what matters next.
3. **Act on time** - complete commitments, recover follow-ups, advance quotations, prevent delivery delays, collect payments sooner.

Everything else is secondary.

## Target user

An individual B2B seller or solo commercial operator running their own complex commercial motion: founder-led sellers, technical and consultative sellers, account managers and business development who own their own follow-up, consultants and agency owners who sell and then deliver.

There are no persona modes. One product, one voice, one target user during validation.

## What Memoire is not

- A generic CRM replacement
- A generic productivity application
- A task manager
- An invoicing application
- An accounting system
- A project-management suite
- An AI sales assistant
- An ERP
- An all-in-one freelancer platform

## Positioning guardrails

These may appear descriptively where a sentence needs them. None may be the headline claim or the category:

- "AI sales assistant"
- "Never miss a follow-up"
- "Flexible CRM"
- "Revenue intelligence platform"
- "All-in-one business management"
- "Generic productivity OS"

**No AI dependency** is a trust differentiator, not the promise. Parsing, prioritisation, search and recommendations are deterministic and run on the user's device. Say it where trust is the question; never lead with it.

## Product phase

Single-user private beta. The purpose of this phase is to find out whether one individual B2B seller repeatedly gets value from the core loop. No team functionality, no external integrations, no paid AI dependencies, and no growth in the number of top-level modules.

Prepared for, but explicitly out of scope: team workspaces, shared ownership, manager workflows, CRM integrations, email and calendar ingestion, commercial approvals, cross-functional handovers, enterprise controls.

## Information architecture

```text
GLOBAL
+ Capture
Search & Insights
Settings

PRIMARY NAVIGATION
Today
Accounts
Opportunities
Money
Timeline
Review
```

Six primary destinations, enforced by `src/config/featureRegistry.ts` and `scripts/verify-navigation-contract.mjs`. There is no seventh.
