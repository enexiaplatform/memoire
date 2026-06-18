# Memoire Operator Monitoring Signals

Date: 2026-06-16

Roadmap link: A7 production monitoring bridge

## Purpose

Memoire now emits a small set of sanitized operational client events to `/api/client-log` so the operator can see important browser-side failures in serverless logs.

This is meant for the first controlled cohort. It is not a replacement for a full observability stack.

## Client Log Endpoint

```text
POST /api/client-log
```

The endpoint:

- Accepts only allowlisted operational events.
- Rate limits repeated submissions.
- Returns `202` for accepted logs.
- Writes sanitized JSON to server logs.
- Does not accept arbitrary payloads or customer records.

## Current Events

| Event | Source | Meaning | Operator Action |
| --- | --- | --- | --- |
| `cloud_json_sync_failed` | Review Packs, Sales Assets, Action Outcomes shared cloud JSON sync | A browser-local write survived, but cloud sync failed. | Check Supabase table health, RLS, auth session, and recent deploys. |
| `pipeline_defense_cloud_sync_failed` | Pipeline Defense Brief cloud store | Core activation artifact could not load, create, update, or delete in cloud. | Treat as high priority during cohort; confirm local fallback preserved the user's work. |

## Server Log Filter

Search Vercel function logs for:

```text
Memoire client operational event
cloud_json_sync_failed
pipeline_defense_cloud_sync_failed
```

Expected JSON fields:

- `level`
- `eventName`
- `route`
- `dataMode`
- `component`
- `operation`
- `table`
- `error`
- `timestamp`

The `error` field is capped and should be treated as a diagnostic hint, not a user-facing message.

## Static Contract Verification

Before cohort invite, run:

```bash
npm run verify:production-readiness
```

This confirms `/api/client-log` still accepts only the allowlisted operational events, rate limits repeated submissions, sanitizes logged fields, and emits the `Memoire client operational event` marker that operators search in deployment logs.

## Daily Cohort Review

During the first cohort week:

1. Check `/api/health`.
2. Check Vercel function errors.
3. Search logs for the two operational event names above.
4. Review Supabase auth/database errors for the same time window.
5. Review AI provider usage and daily cost.
6. Record the daily result in the cohort operator notes.

## Pass Rule For A7

A7 can move from "instrumented" to "operational evidence exists" only when:

- Production `/api/health` returns HTTP `200` with `ok: true`.
- Vercel logs show the operator can filter client operational events.
- There is a named owner for daily log review.
- AI usage/cost is checked daily or has an alert destination.
- Supabase auth/database failures are reviewed for the cohort environment.

## Remaining Gap

There is still no external alerting integration. For a 5-10 person cohort, manual daily review is acceptable if the owner is named and the cohort size stays constrained.
