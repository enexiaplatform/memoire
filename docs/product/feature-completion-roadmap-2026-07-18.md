# Feature Completion Roadmap (2026-07-18)

Full-product audit answer to: "what remains to develop and complete every
feature". Companion doc: `polish-professional-pass-2026-07-18.md` (the how-it-
feels plan; this one is the what-it-does plan).

## Where the product actually stands (audited today)

- The core loop — capture → ledger → linked entities → money/silence state →
  next action → weekly review → outcomes → learning — is shipped end-to-end
  and guarded by ~60 contract scripts (`npm run check` passes as of today).
- Money-spine is complete: money-out + cash position, post-won watch,
  own-obligations watch, manager share link, in-app daily digest.
- Weekly commitment layer is shipped in two of its three touchpoints:
  snapshot + confirm (WeeklyCommitmentPanel in Reviews) and week-as-days
  planning (WeeklyPlanPage). **The third touchpoint — the "Committed this
  week (n/5)" strip on Today/Dashboard — was specified in the 2026-07-18
  audit (flow item 3) but is not built**: no dashboard file references the
  commitment store.
- No AI anywhere (`verify:no-ai` guards it); capture and Ask run on-device by
  rule. `api/` sits at 7 of 12 Hobby functions — 5 slots free.
- Hidden surface debt: `/app/quotes`, `/app/journey`, `/app/operating-system`
  are routed and internally linked but absent from nav since the 2026-07-02
  demotion. Aliases `/app/calendar` and `/app/reviews`/`/app/weekly-brief`
  duplicate live routes. **(Resolved in A3 — but not the way this line
  assumed: two of the three were load-bearing, not debt.)**

## Binding rules (unchanged)

Money-spine; one product one voice; derive-don't-migrate; no new
recommendation engines; Hobby function-cap discipline (count before adding
endpoints); every change lands with its contract in the same commit; the
Stage-3/intelligence gate from the commitment audit stays in force.

---

## Phase A — Finish what is started (SHIPPED 2026-07-18)

A1, A2, A3 shipped and verified live the same day (commits `0e30a5c`,
`66a3467`). A4 remains operator action. Notably A3's audit **reversed two of
its own three proposed decisions** — see the corrected entry below; the
proposal had been made from the nav map rather than the code.

**A1. Committed-week strip on Today/Dashboard.** SHIPPED. The missing touchpoint that
makes the commitment visible *during* the week, not only at planning and
review time. Read-only strip + check-off, reading `weeklyCommitmentStore`;
renders only when a confirmed snapshot exists for the current week. Contract:
extend `verify:weekly-commitment` (strip presence + read-only invariant).

**A2. Commitment analytics verification.** SHIPPED — all four events verified
firing at their call sites, and the contract raised from "the event name is
declared" to "the event is emitted", so a declared-but-dead event can no
longer hold the Phase C gate shut. The four funnel events
(`weekly_commitment_confirmed/edited/resolved/reconciliation_viewed`) were
specified with the feature; verify they actually fire from the shipped
panels, and that the derived rates (acceptance, return, completion,
carry-over) are computable from what is emitted. This is the data the Phase-C
gate reads — if it isn't firing, the gate can never open.

**A3. Orphan-surface decisions.** ~~Fold all three.~~ **The audit (run
2026-07-18, before touching anything) reversed two of the three proposed
folds.** The proposal was made from the nav map; the code says otherwise:

- **Quotes** (`/app/quotes`): **KEEP as-is.** It is the *only* quote
  create/edit surface, and nine contextual links point at it from Money,
  Accounts, Opportunities, Pipeline Defense, Reviews, and Dashboard —
  including Money's own "Create quote" button. A 301 to `/app/revenue`
  would have deleted the only way to create a quote and broken the
  money-spine (deal → quote → PO → delivery → payment) in nine places.
- **Operating System** (`/app/operating-system`): **KEEP as-is.** Same
  shape: it is the only initiative (`OperatingContextRecord`) CRUD surface,
  and five read-surfaces depend on that data — proactive nudges, Today's
  "which initiative is stuck", the weekly business review, next-week
  priorities, and the command center. Reached contextually from Today's
  cockpit and the review's "Open initiatives".
- **Journey** (`/app/journey`): **fold, as proposed.** This one is the real
  legacy orphan — built on the superseded `types/v31` + `useAuth` layer, and
  reachable only from the legacy onboarding modal and `AccountMemoryPage`,
  which is itself **dead code** (imported by nothing, routed nowhere).
  301 to `/app/accounts`; delete `AccountMemoryPage`.
- Keep `/app/calendar` and `/app/weekly-brief` as silent aliases (cheap,
  breaks nothing).

**The generalisable finding:** "routed but not in nav" is not the same as
"orphan". Quotes and Operating System are *contextual detail-surfaces* —
reached from the surface that raises the need, which is a legitimate
pattern and the reason nav stays short. The genuine defect is orientation:
landing on one shows no active nav section, so the user cannot place
themselves in the map. That is a polish-pass problem (P2/P3), not a
deletion problem. Only Journey fails on existence.

**A4. Operator configuration (not code, blocks real users):** fix
`VITE_APP_URL` to the owned host + redeploy; choose the digest email service.
Tracked in `go-live-config-checklist-2026-07-17.md`.

## Phase B — Complete the outbound + data lifecycle (after A, no gate)

**B1. True digest delivery.** One new API function (`api/digest-send`, fits
in the 5 free slots) + Vercel Cron. Renders `buildDailyDigest` per user and
sends via the operator-chosen service (recommendation: Resend — smallest
API, generous free tier). Includes an unsubscribe flag in Settings. Contract:
`verify:digest-send` (auth, rate-limit, opt-out honored, no send without
service key).

**B2. Workspace backup/restore.** SHIPPED 2026-07-18 (`416e151`). The audit
found export was already complete — it collects every `memoire.*` key — so
the gap was only ever the way back in. Restore validates strictly, previews
before writing, refuses newer format versions, never writes outside the
`memoire.` namespace, and drops demo records so a sandbox backup cannot
contaminate a live workspace. Running it end to end found a trap now closed:
restoring inside the demo clears the sample flag, and since access is granted
on a session *or* that flag, a demo visitor was left at the login wall with
their own data behind it — restore is refused in demo mode.

**B3. Account dedup/merge UI.** The canonical account resolver already
unifies reads; give the user a small "these look like the same account —
merge?" surface in Accounts so the underlying records converge too.
Derive-don't-migrate: merge writes a mapping, never rewrites history.

**B4. Mobile capture ergonomics + PWA shell.** SHIPPED 2026-07-18
(`0173091`) — manifest with maskable icon, `start_url` on the workspace, a
long-press shortcut to Capture. The 375px audit found a real defect worth
more than the manifest: **every page in the app scrolled sideways on a
phone** because one machine-made capture tag arrives as an unbroken token and
its chip could not wrap, widening the document to 413px. The fixed header
stretched with it, which disguised it as a header bug. `break-all` +
`max-w-full` on the chip cleared all five money surfaces at once.

Remaining under B4, deliberately not faked: **iOS home-screen icons need a
PNG**, which requires a rasteriser this repo does not have and should not
grow one for. This is a design task — supply `app-icon-192.png` and
`app-icon-512.png` in `public/` and add them to the manifest.

Still open from the original scope: the one-thumb capture ergonomics pass
(tap targets — the audit counted 48 controls under 44px, mostly nav rows at
41px) belongs to polish P8 rather than here.

## Phase C — Evidence-gated (opens only on cohort data)

Gate (from the commitment audit, unchanged): ≥50% of active cohort users
confirm a week at least twice AND ≥40% of confirmed weeks get reconciled,
over ≥4 weeks. Until then these are **frozen**:

- Planning calibration / personalized prioritization (any new weekly
  intelligence).
- Stage-3 route-intelligence expansion beyond what is already built.
- Billing go-live (Stripe live keys, paid gating flip) — the machinery is
  contract-covered; flipping it before a cohort proves willingness-to-pay
  adds support surface with no evidence.

If the gate fails, the prescribed answer is subtraction (the snapshot shape
is wrong), not more intelligence.

## What is explicitly NOT on this roadmap

Invoicing, accounting, task management, CRM sync (standing anti-positions);
persona modes; any AI reintroduction; new recommendation engines; schema
migrations.

## Sequence and size

A1+A2 are one small slice (one strip, one verification pass). A3 is a
decision memo executed inside the polish pass. B1–B4 are each a one-commit
feature with its contract. Phase C is not scheduled — it is unlocked.
