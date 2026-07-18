# Polish Pass: One Professional, Compact, Legible App (2026-07-18)

Companion to `feature-completion-roadmap-2026-07-18.md`. That doc says what
the product still does; this one says how the whole of it comes to feel like
one professional tool — "gọn, dễ hiểu, dễ sử dụng" — without changing what it
means.

Builds on the 2026-07-15 IA pass (nav regroup, one start path, Today
altitude, First Week Path). This pass extends the same principles to every
surface.

## Principles (binding, inherited)

Money-spine preserved on every surface; one voice; honest states; each slice
reversible in a day; no feature removal without the roadmap's Phase-A
decision behind it; contracts updated in the same commit
(`verify-ui-text-polish` and the nav guards are the enforcement points).

## Diagnosis (audited today)

1. **Three "home" surfaces.** Today, Dashboard, and Plan all answer "where do
   I start?" at different altitudes, and all three sit in the primary tier.
   The tier now holds 6 items (Today, Plan, Dashboard, Capture, Activity,
   Ask) — the 2026-07-15 regroup specified 4. Category mixing is creeping
   back in the same way the 07-15 diagnosis described.
2. **Orphan routes** (quotes/journey/operating-system) are reachable from
   in-app links but not nav — a user who lands there has no idea where they
   are in the map.
3. **State inconsistency risk**: 27 feature areas grew over ~60 phases;
   loading/empty/error treatments were written per-phase. The empty-state
   one-CTA rule from S4 was applied to Today but never swept product-wide.
4. **No installability, unaudited small screens**: no manifest; the sidebar
   has a mobile drawer but data-dense tables (Opportunities, Money, Review)
   have not been audited at 375px.

## The passes

### Pass 1 — Information architecture settles (the "gọn")

- **P1. One home, three altitudes, said out loud.** Today = act now;
  Plan = commit the week; Dashboard = manage the whole. Make the sidebar say
  it: primary tier reduces to the daily loop (Today, Capture, Activity, Ask);
  Plan and Dashboard move to the top of a "Steer" grouping with Business
  Review (or equivalent naming that survives a 5-second read). Nav guards
  updated deliberately in the same commit, per the standing pattern.
- **P2. Execute the corrected orphan decisions** from roadmap A3. The audit
  reversed two of the three folds: Quotes and Operating System are the only
  CRUD surfaces for quotes and initiatives and stay exactly where they are;
  only Journey folds. So P2 is **not** a deletion pass — it is an
  *orientation* pass. A contextual detail-surface (Quotes, Operating System,
  a review pack, a shared brief) must say where it sits: an active parent
  section in the nav, and a header that names the surface that sent you
  there. Exit criterion: landing on any page, a user can say what it is for
  and which part of the app it belongs to, without using the back button.
- **P3. Page-title/one-voice header contract.** Every page opens with the
  same header anatomy: what this page answers, the one primary action, and
  nothing else above the fold that isn't action or state.

### Pass 2 — Every surface honest and calm (the "dễ hiểu")

- **P4. States sweep, product-wide.** One loading treatment (skeleton, not
  spinner-in-card), one empty-state anatomy (what this will show → the one
  CTA → nothing else), one error anatomy (what failed, retry, never a blank).
  Inventory all 27 feature areas, fix deviations. Extend
  `verify-ui-text-polish` with the empty-state one-CTA rule product-wide.
- **P5. Copy sweep.** Action-first section headers; no internal jargon
  leaking to UI (e.g. "initiative health", "operating context" — rename or
  explain inline); numbers always carry their basis (currency label rule
  already enforced — extend the same discipline to dates and periods:
  "this week (Jul 14–18)" not "this period").
- **P6. Sync/trust visibility.** `workspaceSyncStatus` exists; surface one
  consistent, quiet indicator (saved locally / synced / offline) in the
  shell, not per-page. Local-first is a selling point — say it once, calmly.
- **P7. Interaction quality.** Consistent toast/undo pattern for destructive
  or bulk actions; focus management in drawers and modals (open→trap→return);
  Escape closes; keyboard reachability on the capture flow end-to-end (it is
  the highest-frequency flow).

### Pass 3 — Professional finish (the "dễ sử dụng" at the edges)

- **P8. Small-screen audit.** 375px pass over the five money surfaces
  (Today, Capture, Opportunities, Money, Review): tables become cards or get
  purposeful horizontal scroll; tap targets ≥44px; capture is one-thumb.
  Plus the PWA shell from roadmap B4 (manifest + icons).
- **P9. Print/share artifacts.** Pipeline Defense Brief and Review Pack are
  the outward face of the product; audit print CSS and shared-brief page so
  the artifact a manager sees is flawless (page breaks, no nav chrome, brand
  header).
- **P10. Performance + accessibility budget.** Routes are already
  lazy-loaded; add a budget check (landing LCP, app-shell interactive on the
  demo dataset) and extend the existing accessibility failure-state contract:
  labels on all interactive elements, contrast on the brand palette, and the
  drawer/modal focus rules from P7 as testable assertions.

## Sequencing and measurement

Order: Pass 1 → Pass 2 → Pass 3. Each pass is a small number of one-commit
slices with its contract; nothing spans more than a day, per the standing
reversibility rule.

Success signal is the same one the 07-15 pass set: first-capture and
first-review conversion in cohort Wave 1, plus verbal "I know where I am /
what to do" feedback in demo sessions. Kill criterion unchanged: any slice
that confuses demo users worse reverts in one commit.

## Explicitly not in scope

Visual rebrand; dark mode; Vietnamese localization (positioning and cohort
are English-first — revisit only on cohort evidence); animation work beyond
existing transitions; any change to what a surface means.
