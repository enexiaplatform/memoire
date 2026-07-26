# Manual QA: Focused Refactor

Date: 2026-07-26
Scope: everything the automated suite cannot see - real auth, real cloud sync, cross-device behaviour, and the usability acceptance criteria.

`npm run check` (79 contracts) and `npm test` (219 tests) cover the code. This covers the product.

## Environment

Run against a preview or production deployment with a **real signed-in account**, not the demo. Where a step says "second device", a second browser profile is enough.

---

## A. Usability acceptance (the one that matters)

A new tester must complete this without founder guidance:

> Record a real customer interaction and make sure the next commercial commitment is not forgotten.

| # | Step | Pass when |
|---|---|---|
| A1 | Land on the app for the first time | Today is the landing page. Exactly six primary destinations in the rail. |
| A2 | Find Capture | Found within 10 seconds, without being told where it is. |
| A3 | Save a commercial event | Paste or type; save works without filling optional detections. |
| A4 | Link or create an account | The capture attaches to a customer without leaving the flow. |
| A5 | Create a next commitment | Three decisions only: who owes it, what, by when. |
| A6 | See it in Today | The commitment appears under Commitments, grouped by when it is due. |
| A7 | See it in Timeline | The same commitment, same state, on Timeline > Upcoming. |
| A8 | Return later and complete it | Ticking it in either place marks it kept in both. |
| A9 | Understand the customer context | Open the Account: what happened, who is involved, what is open, what is next. |
| A10 | Run a first weekly Review | Review's empty state teaches its own first run. |

**Fails if** the tester has to ask what Pipeline Defense is, what a Workspace Lens was, what the Operating System page does, which of several onboarding paths to follow, or how to configure AI.

---

## B. Navigation and legacy links

| # | Check | Expected |
|---|---|---|
| B1 | Sidebar | Today, Accounts, Opportunities, Money, Timeline, Review. Then Search & Insights, Settings. Capture is the top-bar button. |
| B2 | No seventh destination | No Dashboard, Plan, Activity, Pipeline Defense, Playbook, Assets, Stakeholders, Objections, Quotes or Operating System in the rail. |
| B3 | `/app/dashboard` | Redirects to Today. |
| B4 | `/app/plan` | Redirects to Timeline > Upcoming, tab selected. |
| B5 | `/app/activity` | Redirects to Timeline > History, tab selected. |
| B6 | `/app/activity?activityId=<real id>` | Lands on History **with the activity's detail modal open**. The `view=history` tab must survive. |
| B7 | `/app/calendar`, `/app/weekly-brief`, `/app/journey`, `/app/history`, `/app/entities`, `/app/deals`, `/app/search` | All resolve; none 404. |
| B8 | `/app/onboarding/quick-start`, `/app/onboarding/sales-operating-setup`, `/app/onboarding/pipeline-review` | Resolve to Today, Settings, Review. |
| B9 | A previously shared brief link (`/share/brief?...`) | Still renders the shared brief. |
| B10 | Browser back after each redirect | Does not trap the user in a redirect loop. |

---

## C. Commitment ledger

| # | Check | Expected |
|---|---|---|
| C1 | Record "I owe" | Owner defaults to You. |
| C2 | Record "Customer owes" | Owner defaults to the account name; a named person can be set. |
| C3 | Record "Internal owes" | Owner field offered. |
| C4 | Complete | Moves to Settled, shown as Kept. |
| C5 | Cancel | Moves to Settled, shown as Cancelled. |
| C6 | Reschedule once | Due date moves; row shows "first promised <original>, moved 1×"; status stays open. |
| C7 | Reschedule twice | Counter reads 2×; a `COMMITMENT_REPEATEDLY_RESCHEDULED` recommendation appears. |
| C8 | Complete a rescheduled commitment | Marked kept. The original date is still visible in history. |
| C9 | Tick on Today, then open Timeline | Same record, same state. No double entry. |
| C10 | Overdue grouping | An overdue commitment appears under Overdue on both surfaces and raises a risk. |
| C11 | Undated commitment | Appears under "No date yet" and raises `COMMITMENT_WITHOUT_DUE_DATE`. |

---

## D. Commercial threads and risk

| # | Check | Expected |
|---|---|---|
| D1 | Existing workspace, no thread records | Threads appear anyway, one per opportunity. Nothing had to be migrated. |
| D2 | Account with activity but no opportunity | Still gets a thread. |
| D3 | Thread card | States money position, waiting party, days quiet, next commitment. |
| D4 | Record a customer commitment on a single-deal account | The thread's waiting party flips to "You are waiting on them" and the next commitment fills in. |
| D5 | Account with two open deals | An unattached commitment is **not** guessed onto either. |
| D6 | Account with one open and one won deal | The commitment attaches to the open one. |
| D7 | "Why am I seeing this?" | Shows rule name, threshold, source record ids, calculation time, and states nothing was sent to an AI service. |
| D8 | Act on a recommendation | The link lands on the record that raised it. |
| D9 | "Did this help?" | Inline, never a modal, dismissible with "Not now". Recording it does not interrupt anything. |
| D10 | Won / lost / archived thread | Never appears in the risk list. |

---

## E. Money

| # | Check | Expected |
|---|---|---|
| E1 | Money page | Commercial lifecycle only. No profit-and-loss statement, no expense logging, no opening cash balance. |
| E2 | Value in motion | Threads whose money has left the starting line and not arrived, quietest first. |
| E3 | Settings | No opening cash balance field. |
| E4 | Existing expense records | Still present in the export file. Confirm by exporting and reading the JSON. |
| E5 | `VITE_ENABLE_BUSINESS_ACCOUNTING=true` on a preview | P&L and expense logging return with every previously entered record intact. |

---

## F. Library gate

| # | Check | Expected |
|---|---|---|
| F1 | New real workspace → `/app/playbook` | Locked, with a plain reason and the remaining conditions. |
| F2 | Same for `/app/assets` | Locked. |
| F3 | Demo workspace | Both open - the demo's job is to show a mature workspace. |
| F4 | Real workspace with 10+ activities, 1 won/lost deal, 1 repeated answered objection | Both unlock. |
| F5 | Load demo data into a real workspace, then clear it | The gate does not unlock. Demo records never count. |

---

## G. Data, sync and recovery (signed in, two devices)

| # | Check | Expected |
|---|---|---|
| G1 | Create a commitment on device A | Appears on device B after reload. |
| G2 | Complete it on device B | Reflected on device A after reload. |
| G3 | Settings > Sync & Recovery | Reports cloud status, last successful sync, last backup, unsynced changes, and the current data mode. |
| G4 | Kill the network, edit a commitment | Data mode shows `sync-failed`; the record is not lost. |
| G5 | Restore the network, Retry sync | Mode returns to `cloud-synced`. |
| G6 | Export | ZIP includes `commercial_threads`, `commercial_commitments`, `commercial_events`, `commercial_value_outcomes` in `cloudData`, and the `memoire.commercial*` keys in `localBrowserData`. `formatVersion` is 2. |
| G7 | Restore a **version 1** backup (from before this refactor) | Accepted and restored. Nothing is rejected as "newer". |
| G8 | Restore a version 2 backup | Kernel records return. |
| G9 | Restore a backup containing demo records | Demo records dropped; the count is reported. |
| G10 | Read the restore boundary text | States that restore replaces the browser copy and does not replace the cloud, and how to restore safely while signed in. |
| G11 | Two accounts, same browser | Signing in as B never shows A's records. |

---

## H. Trust and privacy

| # | Check | Expected |
|---|---|---|
| H1 | `/api/health` | `ok: true`, `warnings: 0`. |
| H2 | Health with an AI key set | `no_ai_provider_configured` warns. Still `ok: true` - AI is never a required dependency. |
| H3 | Network tab while using the app | No request to any AI provider. |
| H4 | Network tab, product events | POSTs go to `/api/product-events`, never `/api/request-access`. |
| H5 | Inspect an event body | Exactly five fields. No account name, note, amount or email. |
| H6 | Trigger an event from a page with a query string | The `route` field is empty, not truncated. |
| H7 | Supabase `product_events` after a session | Rows present. Every event the client sent is there - none rejected. |
| H8 | Demo session | Rows carry `is_demo: true`. |
| H9 | Block `/api/product-events` in devtools | The app keeps working; nothing surfaces to the user. |

---

## I. Regression

| # | Check |
|---|---|
| I1 | Capture parses a pasted note and saves without any optional field. |
| I2 | Duplicate capture does not create two active opportunities for one customer. |
| I3 | Pipeline Defense Brief generates from Review > Pipeline Defense. |
| I4 | A review pack saves and reopens by direct URL. |
| I5 | CSV import works from `/app/opportunities?import=csv`. |
| I6 | Account merge still refuses to rewrite records. |
| I7 | Mobile (375px): no horizontal scroll on Today, Timeline, Money, Review. |
| I8 | Keyboard: skip link, Escape closes the mobile nav, tab order sane on the ledger composer. |

---

## Sign-off

QA passes when A1-A10 complete without founder guidance and no B, C, D, G or H row fails. A failure in E, F or I is a bug to fix, not a release blocker for the single-user beta.
