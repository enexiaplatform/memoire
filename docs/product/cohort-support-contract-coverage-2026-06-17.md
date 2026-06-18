# Cohort Support Contract Coverage

Date: 2026-06-17

Roadmap slice: A9/C5 cohort support readiness

## Decision

Memoire now has an automated static verifier for the controlled-cohort support and feedback contract.

This improves readiness for a 5-10 person early-access cohort, but it does not prove operational support is live. A9 remains open until the operator confirms the support inbox, names primary and backup owners, runs one test support request, and records support notes in the cohort tracker or weekly operating review.

C5 remains open until the same operational evidence proves the support and incident process can work outside the repo.

## What The Verifier Covers

`scripts/verify-support-cohort-contract.mjs` checks that:

- The cohort validation plan still defines cohort size, 14-day duration, qualification score, invite order, onboarding, first review push, real usage window, closeout interview, stop/go criteria, and required evidence before invite.
- Outreach templates still cover qualified invite, warm DM, clarification, onboarding confirmation, activation nudge, closeout interview, not-a-fit response, and paid-intent ask.
- The feedback tracker still includes qualification, activation, review-pack, weekly-intent, willingness-to-pay, blocker, support, decision, and next-step fields.
- The early-access support runbook still defines support channel, owner expectations, in-app guidance, severity levels, intake fields, incident workflow, export data handling, billing boundary, and C5 pass criteria.
- Settings -> Export & Delete still gives users a support package path and warns that exports may contain customer and pipeline information.
- The weekly operating review template still includes A9/C5 support review, SEV0/SEV1 status, export-retention notes, and confidentiality guidance.

## Runtime Evidence Still Required

A9 remains open until the cohort release packet records:

- Confirmed live support inbox.
- Named primary support owner.
- Named backup support owner.
- Confirmed SEV0/SEV1 escalation owner.
- One test support request received, answered, and logged.
- Support notes recorded in the cohort tracker or weekly operating review.

C5 remains open until the same evidence is captured and reviewed during the operating cadence.

## Operator Command

Run before cohort signoff and after cohort/support process changes:

```bash
npm run verify:support-cohort
```

`npm run check` also runs this verifier so cohort support drift is caught with the rest of the commercial release gates.
