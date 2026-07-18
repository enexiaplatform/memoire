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
  duplicate live routes.

## Binding rules (unchanged)

Money-spine; one product one voice; derive-don't-migrate; no new
recommendation engines; Hobby function-cap discipline (count before adding
endpoints); every change lands with its contract in the same commit; the
Stage-3/intelligence gate from the commitment audit stays in force.

---

## Phase A — Finish what is started (no gate, do now)

**A1. Committed-week strip on Today/Dashboard.** The missing touchpoint that
makes the commitment visible *during* the week, not only at planning and
review time. Read-only strip + check-off, reading `weeklyCommitmentStore`;
renders only when a confirmed snapshot exists for the current week. Contract:
extend `verify:weekly-commitment` (strip presence + read-only invariant).

**A2. Commitment analytics verification.** The four funnel events
(`weekly_commitment_confirmed/edited/resolved/reconciliation_viewed`) were
specified with the feature; verify they actually fire from the shipped
panels, and that the derived rates (acceptance, return, completion,
carry-over) are computable from what is emitted. This is the data the Phase-C
gate reads — if it isn't firing, the gate can never open.

**A3. Orphan-surface decisions** (decision now, execution in the polish
pass):
- **Quotes** (`/app/quotes`): fold into Money as a tab/section — quotes are a
  money-flow lane already; a second standalone money surface violates
  one-voice. Route 301s to `/app/revenue`.
- **Journey** (`/app/journey`): its account-timeline value belongs inside the
  Accounts drawer; fold and 301 to `/app/accounts`.
- **Operating System** (`/app/operating-system`): overlaps Plan + Business
  Review; keep only if it renders something neither does (audit first),
  else 301 to `/app/plan`.
- Keep `/app/calendar` and `/app/weekly-brief` as silent aliases (cheap,
  breaks nothing).

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

**B2. Workspace backup/restore.** `api/export` exists; complete the loop
with a full-workspace JSON download (every store, versioned envelope) and a
restore path that refuses partial/foreign envelopes. This is the trust
feature for a local-first product: the user can always walk away with
everything. No new endpoint needed for restore (client-side into stores).

**B3. Account dedup/merge UI.** The canonical account resolver already
unifies reads; give the user a small "these look like the same account —
merge?" surface in Accounts so the underlying records converge too.
Derive-don't-migrate: merge writes a mapping, never rewrites history.

**B4. Mobile capture ergonomics + PWA shell.** Capture is the spine and
happens away from the desk. Add a web manifest + icons (none exist today) so
the app is installable, and audit the Capture page at 375px: one-thumb
quick-capture, templates reachable, voice dictation button prominent. No
offline-sync work — local-first storage already covers the common case.

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
