# Trust Boundary Contract Coverage

Date: 2026-06-17

Roadmap slice: A8/R10 trust readiness

## Decision

Memoire now has an automated static verifier for the product-boundary and AI/provider disclosure contract that supports the controlled cohort gate.

This is not legal approval. A8 remains open until the operator records legal review or explicit accepted risk for the actual jurisdiction, business entity, deployed product behavior, and customer guidance.

## What The Verifier Covers

`scripts/verify-trust-boundary-contract.mjs` checks that:

- Public legal routes remain mounted for `/privacy`, `/terms`, and `/legal/:document`.
- Privacy, Terms, and Product Boundaries still describe early-access behavior, AI-assisted features, provider handling, human review, no CRM writeback, and support contact.
- Settings still exposes Data and Product Boundaries and links to the full boundaries page.
- Ask Memoire still distinguishes local rule-based answers from configured Ask endpoint answers and warns about selected context sent to the configured AI provider.
- Daily Capture AI Assist still warns that AI classification sends the note to a configured server-side endpoint and requires review before saving.
- Quick Capture still distinguishes Quick Note AI-assisted structuring from Email Thread local parsing.
- Pipeline Defense Draft Assist still describes deterministic local drafting with no AI API or network request.
- The AI disclosure hardening document still maps Ask Memoire, Daily Capture, Quick Capture, Pipeline Draft Assist, and legal-review gaps.

## Runtime Evidence Still Required

A8 remains open until one of these is recorded in the cohort release packet:

- Legal review approves the Privacy, Terms, Product Boundaries, and AI disclosure for the actual launch context.
- The operator explicitly accepts legal-copy risk for the first tiny cohort, with owner, expiry date, and reversal trigger.

R10 remains open until deployed UX QA confirms the disclosures are visible near the relevant AI-assisted features and match the configured provider behavior.

## Operator Command

Run before cohort signoff and after trust-boundary copy changes:

```bash
npm run verify:trust-boundary
```

`npm run check` also runs this verifier so trust-boundary drift is caught with the rest of the commercial release gates.
