# Weekly Operating Review Template

Date: 2026-06-17

Roadmap slice: C3 weekly production monitoring and Session 12 operating loop

## Purpose

Use this every Friday during a controlled early-access cohort.

The review has one job: decide whether Memoire is getting closer to a safe paid early-access offer, or whether the cohort should pause because trust, reliability, support, or activation evidence is weak.

## Required Inputs

Collect these before the review:

- Funnel SQL results from `docs/product/operator-funnel-queries-2026-06-16.sql`.
- Cohort tracker rows from `docs/product/cohort-feedback-tracker-2026-06-16.csv`.
- Support notes from `docs/operations/early-access-support-incident-runbook-2026-06-17.md`.
- `/api/health` production result.
- Vercel function error summary.
- Vercel log search for `Memoire client operational event`.
- Supabase Auth and database error summary.
- AI provider usage and daily cost.
- Any legal, deletion, export, or data-boundary issues.

## Weekly Scorecard

| Area | Metric | Current Week | Previous Week | Target For Cohort | Status |
| --- | --- | ---: | ---: | ---: | --- |
| Access | Qualified leads reviewed |  |  | 5-10 total invited |  |
| Access | Invites sent |  |  | 5-10 total invited |  |
| Activation | First login completed |  |  | 80% of invited |  |
| Activation | CSV import or manual opportunity |  |  | 4/5 active users |  |
| Value | Pipeline Defense Brief created |  |  | 4/5 active users |  |
| Value | Review Pack saved or manager summary copied |  |  | 3/5 active users |  |
| Retention | Second session or return usage |  |  | 3/5 active users |  |
| Trust | Users willing to use sanitized real data |  |  | 3/5 active users |  |
| Monetization | Paid-intent signals |  |  | 2/5 active users |  |
| Support | Open SEV0/SEV1 issues |  |  | 0 unresolved |  |
| Reliability | Failed cloud sync events |  |  | 0 unexplained repeats |  |
| Cost | AI spend |  |  | Within operator ceiling |  |

Status values:

- Green: on track.
- Yellow: watch or needs follow-up.
- Red: blocks cohort expansion or paid offer design.

## Release Gate Review

Update these each week:

| Gate | Question | Evidence Link Or Note | Decision |
| --- | --- | --- | --- |
| A1 | Did `/api/health` return production-ready? |  |  |
| A2 | Did rate limits/access controls behave as expected? |  |  |
| A3 | Any account isolation concern? |  |  |
| A4 | Any demo-to-account contamination concern? |  |  |
| A5 | Were new leads retrieved and assigned? |  |  |
| A6 | Any auth recovery or OAuth issue? |  |  |
| A7 | Were logs, failures, and AI cost reviewed? |  |  |
| A8 | Any legal/data-boundary concern? |  |  |
| A9 | Are cohort support/interview notes current? |  |  |
| A10 | Can active users return to their workflow safely? |  |  |
| C3 | Was this operating review completed and recorded? |  |  |
| C5 | Any support incident requiring escalation? |  |  |

Decision values:

- Pass this week.
- Watch.
- Blocked.
- Accepted risk.
- Not applicable.

## Customer Evidence

Record the highest-signal evidence, not every note.

### Strongest Activation Evidence

- User:
- Workflow reached:
- Evidence:
- Quote:

### Strongest Trust Concern

- User:
- Concern:
- Severity:
- Follow-up owner:

### Strongest Product Blocker

- User:
- Blocker:
- Frequency:
- Decision: fix now, manual workaround, later backlog, or reject.

### Strongest Paid-Intent Signal

- User:
- Budget owner:
- Price signal:
- Missing condition before payment:

## Support And Incident Review

| Item | Severity | Owner | Age | Status | Next Action |
| --- | --- | --- | ---: | --- | --- |
|  |  |  |  |  |  |

Required actions:

- If any SEV0 is open, stop invites and do not discuss paid access.
- If any SEV1 is unresolved for more than one business day, stop cohort expansion until there is a mitigation.
- If support exports were received, record retention/deletion plan.
- If a user requested account deletion, confirm whether local, cloud, or both were completed.

## Monitoring Review

| Signal | Reviewed? | Finding | Owner |
| --- | --- | --- | --- |
| `/api/health` |  |  |  |
| Vercel function errors |  |  |  |
| Client operational events |  |  |  |
| Supabase Auth errors |  |  |  |
| Supabase database errors |  |  |  |
| AI provider usage/cost |  |  |  |
| Stripe/webhook errors, if enabled |  |  |  |

## Go/No-Go Decision

Choose one:

- Continue cohort unchanged.
- Continue cohort with fixes.
- Pause new invites.
- Move to pricing and packaging design.
- Prepare paid early-access checkout.
- Stop or reposition.

Decision:

Rationale:

Required next actions:

1.
2.
3.

## Backlog Policy

Classify each request:

| Request | Source | Frequency | Commercial Impact | Decision |
| --- | --- | ---: | --- | --- |
|  |  |  |  |  |

Decision options:

- Fix before next cohort user.
- Manual support workaround.
- Add to post-cohort backlog.
- Reject for current ICP.
- Needs more evidence.

## Storage

Save each completed review as:

```text
docs/operations/weekly-reviews/YYYY-MM-DD-operating-review.md
```

Do not include confidential customer content in the review. Use participant aliases and sanitized quotes unless the user has approved attribution.

## Pass Criteria For C3

C3 can move from template-ready to operational evidence only when:

- One completed weekly review is saved under `docs/operations/weekly-reviews/`.
- The review includes funnel metrics, support status, production health, log review, AI cost review, and release-gate decisions.
- A named operator owns next actions.
- Any accepted risk is explicitly recorded.

Current status:

- Template exists.
- First completed review is still missing.
