# Focused Refactor: Personal Commercial Control Tower

Date: 2026-07-26
Supersedes: `pivot-business-activity-os-2026-07-09.md` (kept as history)

## Why

Memoire worked, and could not be described. Seventeen navigation entries across three progressively-disclosed tiers, six competing onboarding mechanisms, two persona voices, and a promise ("Business Activity OS") broad enough to cover anything. Every addition had been reasonable on its own; the sum was a product a first-time user could not form a model of.

This refactor narrows the product to one promise - **from conversation to cash, nothing goes silent** - and gives it an internal foundation strong enough to grow on: a Commercial Kernel of four relational record types, one set of application commands, and a deterministic policy engine.

## The feature existence gate

Every standalone surface had to pass at least three of five tests:

1. Used daily or weekly.
2. Creates or updates a source-of-truth record.
3. Materially changes a next action, commercial risk, commitment, or money state.
4. Its job cannot be done naturally inside Today, Account, Opportunity, Money, Timeline or Review.
5. A first-time target user understands its purpose without founder explanation.

| Surface | 1 | 2 | 3 | 4 | 5 | Score | Outcome |
|---|---|---|---|---|---|---|---|
| Today | ✅ | ❌ | ✅ | ✅ | ✅ | 4 | **core** |
| Accounts | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | **core** |
| Opportunities | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | **core** |
| Money | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | **core** |
| Timeline | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | **core** (merged from Plan + Activity) |
| Review | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | **core** |
| Capture | ✅ | ✅ | ✅ | ✅ | ✅ | 5 | **global action** - the loop's entry point, not a destination |
| Search & Insights | ✅ | ❌ | ❌ | ✅ | ✅ | 3 | **global action** |
| Settings | ❌ | ✅ | ❌ | ✅ | ✅ | 3 | **global action** |
| Dashboard | ❌ | ❌ | ❌ | ❌ | ✅ | 1 | **embedded** → Today (priorities) + Review > Analytics (trend) |
| Plan | ✅ | ✅ | ✅ | ❌ | ✅ | 4 | **embedded** → Timeline > Upcoming. Passed the gate but read as a rival calendar next to Activity. |
| Activity | ✅ | ✅ | ❌ | ❌ | ✅ | 3 | **embedded** → Timeline > History. Same reason. |
| Pipeline Defense | ❌ | ✅ | ✅ | ❌ | ❌ | 2 | **embedded** → Review tab + artifact |
| Stakeholders | ❌ | ✅ | ❌ | ❌ | ✅ | 2 | **embedded** → Account / Opportunity; route kept as the editor |
| Objections | ❌ | ✅ | ✅ | ❌ | ✅ | 3 | **embedded** → Opportunity; route kept as the editor |
| Quotes | ❌ | ✅ | ✅ | ❌ | ✅ | 3 | **contextual** - opened from Money, Opportunity, Search |
| Operating System | ❌ | ✅ | ❌ | ❌ | ❌ | 1 | **embedded** → renamed "Must-win work", opened from Review |
| Playbook | ❌ | ✅ | ❌ | ✅ | ❌ | 2 | **hidden** behind an evidence gate |
| Assets | ❌ | ✅ | ❌ | ✅ | ❌ | 2 | **hidden** behind the same gate |
| Workspace Lens | ❌ | ❌ | ❌ | ❌ | ❌ | 0 | **removed** |
| Quick Start Setup | ❌ | ❌ | ❌ | ❌ | ❌ | 0 | **removed** - folded into First Week Path |
| Sales Operating Setup | ❌ | ❌ | ❌ | ❌ | ❌ | 0 | **removed** - nobody defines a GTM system before experiencing value |
| First Pipeline Review Flow | ❌ | ❌ | ❌ | ❌ | ✅ | 1 | **removed** - folded into Review's empty state |
| Founder Import | ❌ | ✅ | ❌ | ✅ | ❌ | 2 | **founder-only**, never a destination |

Three surfaces kept their routes despite scoring low, because each is the **only editor** for records the embedded panels display read-only: Stakeholders, Objections, and the former Operating System page. Removing a page is an information-architecture decision; removing the only way to create a record is a data decision, and it was not the one being made.

The live registry is `src/config/featureRegistry.ts`. `scripts/verify-navigation-contract.mjs` fails the build if the six primary destinations change, if a hidden feature becomes visible, or if a nav item is hard-coded outside the registry.

## What the product is now

```text
GLOBAL          + Capture · Search & Insights · Settings
PRIMARY         Today · Accounts · Opportunities · Money · Timeline · Review
```

Operating loop:

```text
Capture → Commercial Thread → Commitment → Silence and Risk → Today → Review → Measured Commercial Value
```

## The Commercial Kernel

Eight canonical concepts, declared once in `src/domain/commercialKernel/types.ts`: Account, Opportunity, Commercial Thread, Commercial Event, Commitment, Money Checkpoint, Action, Outcome. Everything else in the product is a view, a derived recommendation, an artifact, a UI state, an adapter or a cached projection.

Four relational tables, not JSON collections:

- `commercial_threads` - the continuous story toward one outcome.
- `commercial_commitments` - who owes what, by when, with what impact. No `rescheduled` status: a moved promise is still open, and `original_due_date` is never overwritten.
- `commercial_events` - what happened, with `occurred_at` and `recorded_at` kept apart and a partial unique index on `idempotency_key`.
- `commercial_value_outcomes` - whether Memoire actually helped.

Threads are **derived, not migrated**. `resolveCommercialThreads` reads existing opportunities, activities, quotes and commitments; an explicit stored thread always wins over the derived one. No backfill, nothing to undo.

## Design decisions worth recording

**Why relational and not another JSON collection.** The existing `payload jsonb` pattern is right for cached recommendations and snapshots - records with no lifecycle. A commitment has a lifecycle, a renegotiated due date, and a party who owes it; "what is overdue" and "which threads are silent" are filters and sorts, and a blob makes every one of them a full scan of the workspace.

**Why no `rescheduled` commitment status.** A promise moved twice and then kept would be neither open nor completed, which makes "how many promises am I keeping?" unanswerable. A reschedule moves `current_due_date` and appends to `due_date_history`; `original_due_date` stays as first promised, because "the customer said Tuesday and it is now the third Tuesday" is a different fact from "it is due Friday".

**Why commands, not page handlers.** Today, the plan board, Capture and the deal drawer each carried their own "complete this", which is why a commitment ticked in one place could stay open in another and nothing recorded *that* it had been completed. Commands validate, write the record, write the history event, sync, and return a typed result rather than throwing inside a click handler.

**Why the policy engine never writes.** A recommendation that silently changes a stage is indistinguishable from a bug, and the user cannot audit it. Rules read; the user decides. Every recommendation carries `reasonCode`, `reasonText`, `sourceRecordIds`, `threshold`, `severity`, `recommendedAction` and `calculatedAt`, and the interface shows all of them behind "Why am I seeing this?".

**Why the value ledger offers "I would have done it anyway" first.** A ledger that can only record wins measures nothing. The point of this record is to be able to tell whether Memoire is worth paying for, which requires the honest answer to be exactly as easy to give as the flattering one - and requires the prompt never to be a modal, because a dialog after every action trains people to dismiss it.

## Bugs found by building this

Each of these was invisible to the existing test suite:

1. **Fourteen of twenty analytics events were never recorded.** `product_funnel_events` allowed six event names; the client sent twenty. Postgres rejected the rest, the endpoint caught the error and returned 202.
2. **Production health required an AI key the product does not use.** Two required checks demanded AI configuration; `/api/health` was returning 503 on a correctly configured deployment.
3. **Activity dates shifted a day backwards east of UTC.** Parsed as local time, re-serialised to ISO - threads read as staler than they were.
4. **Demo mode showed "nothing is going silent"** over a pipeline of overdue payments, because the policy rules skipped sample records - correct in a real workspace, wrong in the showcase.
5. **Loading demo data left the thread list empty**, because the hook's dependencies did not include the sample-data flag and the user id never changes in that transition.
6. **A commitment recorded against a customer never reached that customer's thread**, so the thread reported "no next commitment" while the promise sat one panel away.
7. **Following an `?activityId=` deep link cleared the whole query string**, taking Timeline's `view=` with it.

## Deliberately not built

Teams, workspaces, RBAC, invitations, manager dashboards, shared comments. CRM/email/calendar integrations. Any AI provider. Invoicing, accounting, inventory, project management. A workflow or automation builder. A seventh primary destination.

Interfaces are prepared for the first two - `source_type`/`source_id`/`source_url`/`idempotency_key` on every kernel record, and a `CommercialScope` object instead of a global current-user read - but no speculative tables were created. Future-proof the interface, not the feature.
