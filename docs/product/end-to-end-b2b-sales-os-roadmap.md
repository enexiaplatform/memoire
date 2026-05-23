# Memoire Personal B2B Sales OS Roadmap

## Product direction

Memoire should become a personal end-to-end workspace for a B2B salesperson:

1. Capture daily sales activity quickly.
2. Turn raw notes into structured sales memory.
3. Review activity by week and month.
4. Understand opportunity quality before forecast or pipeline review.
5. Convert risk into concrete weekly actions.
6. Keep the app personal-first, with cloud sync only where intentionally configured.

## Area 1: Activity Calendar and Recap

Implemented first:

- A dedicated Calendar route at `/app/calendar`.
- Manual sales activity capture.
- Quick Capture saves now also record an activity calendar entry.
- Local deterministic classification into call, meeting, email, proposal, follow-up, objection, customer insight, admin, or note.
- Weekly and monthly review modes.
- Recap section with total activity, next actions, risk signals, top accounts, and activity mix.

Future upgrades:

- Cloud persistence for activity records.
- Calendar heatmap view.
- Account-level and opportunity-level drilldowns from calendar events.
- Recap export.
- Optional reminders, without Gmail or calendar inbox access.

## Area 2: Pipeline Quality Center

Implemented first:

- The Opportunities tab is reframed as Pipeline Quality Center.
- It analyzes current opportunities, actions, objections, and interactions.
- It flags missing next actions, stale deals, open objections, low confidence, weak evidence language, blocker-without-action, and missing account links.
- It shows high-risk, needs-cleanup, and healthy deal states.
- It keeps existing opportunity cards, stage filtering, follow-up drafting, and Ask Memoire links.

Future upgrades:

- Cloud-backed pipeline quality snapshots.
- Deal detail page with quality history.
- Forecast hygiene view by owner/time period.
- Salesforce-style list editing only after the core workflow is stable.
- CRM sync only after explicit product decision and security review.

## Guardrails

- No Gmail inbox access was added.
- No CRM sync was added.
- No real AI or LLM API was added.
- No new backend tables were required for this implementation.
- Calendar activity is currently local-first in browser storage.
