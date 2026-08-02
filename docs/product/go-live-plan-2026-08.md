# Go-Live Plan — August 2026

Date: 2026-08-02
Scope: one month, from private beta to official go-live.
Explicitly out of scope this month: payment collection and billing setup (Lemon
Squeezy stays behind `BILLING_CHECKOUT_ENABLED=false`). This month is about the
product working, the follow-through actually reaching the user, and the app
surviving a real book of business.

---

## 1. Where the product actually is

Assessed on 2026-08-02 by walking every destination in a browser at desktop and
phone width, in three workspace states (empty, demo, scaled), plus the contract
suite and the production build.

### What is genuinely strong

**The category and the loop are real.** Capture → thread → commitment → silence
→ Today → Review → outcome → learning is built end to end, not sketched. Most
products at this stage have three of those seven.

**The architecture keeps itself honest.** `src/config/featureRegistry.ts` plus
~90 contract scripts mean the product cannot quietly grow a seventh destination,
lose a legacy route, or ship a lens that starts writing records. `npm run check`
passes green today. This is unusual discipline and it is the main reason a
one-month plan is credible at all.

**No AI dependency is a real differentiator, not a slogan.** Every
recommendation is deterministic, computed on-device, and traceable to a record
the user wrote. For a seller pasting customer emails, "nothing leaves your
browser" is a stronger sales line than any AI feature would be.

**Data-mode honesty.** The sync pill, the sync-recovery panel and the restore
copy tell the truth, including "full cloud restore — Memoire does not do this
yet". Products lie about this constantly; this one does not.

**Instrumentation is designed around the right questions** — activation, value,
trust and funnel events with a data-mode dimension, so "did this person's data
reach the cloud" is answerable.

**Post-2026-08-02 layout work**: the rail is grouped by operating rhythm, the
record pages lead with their list, Orders follows an order the way an ERP does,
and Review opens on outcome against quarter and year.

### What is not ready

Ordered by what would hurt most on launch day.

---

## 2. Findings

### P0-1 · The Dashboard is blank for anyone not signed in

`src/features/business/BusinessLensPage.tsx:100` returns `null` when
`isAuthenticated` is false. In the public demo and in browser-only mode the page
body renders nothing at all — not a skeleton, not an empty state. Reproduced on
both the dev server and the production build, at demo scale.

This is the top of the funnel: the public demo is how a prospect sees the
product, and one of eleven rail items is a white screen. Shipped 2026-07-31 with
the lens itself; it is not a regression from the navigation work.

**Fix:** render for any workspace that has data, authenticated or not — the lens
reads local records like every other surface. **Contract:** extend
`verify-navigation-contract.mjs` so every routed destination renders non-empty
in browser-only mode. **Effort: 30 minutes.**

### P0-2 · Nothing reaches the user outside the app

The promise is "nothing goes silent". Every mechanism that delivers on it —
the daily digest, going-silent detection, overdue commitments, the weekly review
— only fires if the user opens the app. There is no email, no push, no service
worker, no scheduled job. `src/utils/dailyDigest.ts` even builds a `subject` and
a `plainText` body: it was written to be sent and has never been sent.

A follow-through product that can only remind you while you are looking at it
has inverted its own value proposition. This is the single largest product gap.

**Fix:** a scheduled daily digest and a Monday weekly scoreboard by email.
**Effort: 4–6 days** including preferences, unsubscribe and delivery logging.

### P0-3 · Cloud restore does not exist

Settings says it plainly: browser restore rewrites the local copy; restoring
into a signed-in workspace can be overwritten by cloud sync. The documented
workaround is "restore while signed out, check, then sign in".

Backup without reliable restore is not a backup. For a tool holding a seller's
entire book this is the difference between a bad day and a lost customer.

**Fix:** restore into the cloud workspace transactionally, with a pre-restore
snapshot and a visible record count before/after. **Effort: 3–4 days.**

### P0-4 · No storage-quota handling anywhere

29 `localStorage.setItem` calls across `src/services/*`, none guarded. There is
no `QuotaExceededError` handling in `src/`.

Measured from a live workspace: ~2.5 KB per activity, ~1.8 KB per opportunity,
~1.5 KB per account (UTF-16, as the browser counts it). Against the ~5 MB
localStorage ceiling, a user capturing 6 activities a day meets the wall in
roughly 18 months — and much sooner if they use the paste-email capture path,
which stores raw thread text. When it happens today, the write throws, the
record is lost, and the UI has already said it saved.

I could not reproduce the ceiling in this environment (the headless browser's
quota is far below a real one), so this is arithmetic and a code fact, not a
reproduced failure. It does not need to be reproduced to be worth fixing.

**Fix:** guard every write, fail loudly, show storage use in Settings, and start
the IndexedDB migration for the two collections that grow without bound
(activities, quotes). **Effort: 2 days for the guard + meter, 3–4 days for the
migration spike.**

### P0-5 · Behaviour at real scale is unmeasured

The founder's own import is 122 opportunities. Nobody has measured what happens
at 300 deals and 3,000 activities, and this month is when a second and third
user arrive with books that size. My attempt to build that dataset hit the test
browser's storage ceiling, which is itself the answer to "has anyone tried".

**Fix:** a synthetic-workspace generator, a measured budget per surface, and a
CI check that fails when a surface exceeds it. **Effort: 2 days** to measure,
unknown to fix — which is exactly why it goes in week 1 rather than week 4.

### P1-6 · Mobile capture is not the fast path it needs to be

Capture defaults to **Full Note** on every device; Quick Capture is one tap away
but not the default, and the three-mode picker takes the first third of a phone
screen before the text field. The Capture button in the top bar links to
`/app/capture` without `mode=quick`. Capture is the spine of the product and it
mostly happens on a phone, in a lobby, between meetings.

**Fix:** quick mode by default under `sm`, field focused, picker collapsed to a
single row. **Effort: half a day.**

### P1-7 · Only opportunities can be imported

`OpportunitiesPage` owns the only CSV path. A new user's customers, contacts and
history have no bulk route in; accounts appear only as candidates derived from
deals. The first hour of a real user's life with this product is data entry.

**Fix:** accounts + contacts CSV through the existing mapping-profile machinery.
**Effort: 2–3 days.**

### P1-8 · Search & Insights explains before it searches

The page opens with a capability list, a context selector and three rows of
preset questions. There is no search field above the fold on a laptop. It is the
same disease the record pages had before 2026-08-02, and the same fix applies.

**Effort: 1 day.**

### P1-9 · Nothing brings a user back on day two

The First Week Path is good and is the only onboarding mechanism — correctly so.
But it is passive: it waits for the user to return. With P0-2 fixed, day-two
return has a mechanism; until then, activation depends on the user remembering.

### P2 · Smaller items

- **Fonts block first paint.** `@import url('https://fonts.googleapis.com/...')`
  at the top of `src/index.css` serialises HTML → CSS → font CSS → font files,
  and is unreachable on some corporate and regional networks. Self-host or
  preload. *Half a day.*
- **No offline.** The app is installable but has no service worker, so capture
  in a basement or a factory fails. *2 days, and it is the same worker push
  notifications need.*
- **Bundle**: 213 KB + 187 KB (Supabase) shared, ~30 KB gzip per route chunk.
  Acceptable; no action.
- **24 surfaces, 87k lines** for a single-operator product. Not a launch
  problem — the registry keeps it governed — but it is the reason every new
  feature must displace an old one.

---

## 3. The plan

Four weeks, each with a theme, a gate, and the contract that lands with it.
Nothing ships without its verification in the same commit — the existing rule,
unchanged.

### Week 1 (Aug 4–10) · It cannot go blank, and it cannot lose data

The week that removes the reasons not to launch.

| # | Work | Done when |
|---|------|-----------|
| 1.1 | Dashboard renders in browser-only mode | Every routed destination renders non-empty with local-only data; contract added |
| 1.2 | Storage write guard + usage meter in Settings | A failed write surfaces as a visible error and a retry, never a silent loss |
| 1.3 | Scale harness + budgets | 300 deals / 3,000 activities / 400 accounts generated on demand; every surface measured; budget published |
| 1.4 | Fix whatever 1.3 finds | Every surface within budget (target: interactive < 1.5 s at scale) |
| 1.5 | Cloud restore, transactional | Restore into a signed-in workspace shows counts before/after and cannot be silently overwritten by sync |

**Gate:** a workspace with 300 deals is usable end to end, and a backup taken on
Monday restores on Friday into the same account.

### Week 2 (Aug 11–17) · Nothing goes silent, even when the app is closed

The week that makes the promise true.

| # | Work | Done when |
|---|------|-----------|
| 2.1 | Delivery infrastructure | Scheduled job runs daily; Supabase Edge Function + `pg_cron` preferred so the Vercel Hobby function budget (8 of 12 used) stays free |
| 2.2 | Daily digest email | The existing `buildDailyDigest` output sent at a user-chosen hour, only when `hasSignal` is true |
| 2.3 | Weekly scoreboard email | Monday send of the Review scoreboard: closed last week, quarter attainment, what is late |
| 2.4 | Preferences + unsubscribe | Per-user channel and hour in Settings; one-click unsubscribe; delivery logged |
| 2.5 | Service worker + web push (stretch) | Overdue-commitment push on installed PWA; same worker enables offline in week 3 |

**Gate:** a user who does not open Memoire for three days still learns that a
customer went quiet and that a payment is overdue.

### Week 3 (Aug 18–24) · First hour to first value

The week that makes a new user's first day work.

| # | Work | Done when |
|---|------|-----------|
| 3.1 | Mobile-first capture | Quick mode default under `sm`, field focused on open, one-row mode switch |
| 3.2 | Accounts + contacts CSV import | A new user can load their book in one sitting using the existing mapping profiles |
| 3.3 | Search-first Ask | Search field is the first element; presets move below results |
| 3.4 | Offline capture | Capture works with no network and syncs when it returns |
| 3.5 | Empty-state pass | Every destination's empty state names the one action that fills it |

**Gate:** a new user with a spreadsheet and a phone reaches "first thread with a
commitment" in under 20 minutes, measured on a real person who has not seen the
product.

### Week 4 (Aug 25–31) · Go live

| # | Work | Done when |
|---|------|-----------|
| 4.1 | Domain cutover | `founder-launch-runbook.md` steps 1–5 executed; `app_url_matches_request_host: true`; real signup, verification and password reset on the live host |
| 4.2 | Telemetry live | `client-log` entries and `product_events` rows confirmed in production |
| 4.3 | Founder-data QA | The real 122-deal import walked end to end on production, including a real capture, a real commitment and a real weekly review |
| 4.4 | Mobile + accessibility pass | All eleven destinations at 390 px; keyboard path through capture and Today; contrast check |
| 4.5 | Launch operations | Support runbook, incident path, rollback rehearsed once |
| 4.6 | Metrics review | Activation and retention queries run against the first cohort |

**Gate:** the founder's own week runs entirely on production, with email arriving
and nothing lost.

---

## 4. What we are deliberately not doing

Saying this out loud is what keeps the month achievable.

- **No billing.** Deferred by decision.
- **No new destinations.** The rail is full at eleven. Anything new displaces.
- **No AI.** The guarantee is a differentiator and a contract.
- **No team or multi-user.** The product is a personal control tower; sharing is
  the read-only brief link, which already exists.
- **No CRM integrations.** CSV in, brief out. Integrations are a post-launch
  wedge, not a launch requirement.
- **No redesign.** The layout work of 2026-08-02 is the design for this launch.

---

## 5. How we will know it worked

Go-live is not a date, it is these numbers on the first ten real users.

| Question | Metric | Target |
|---|---|---|
| Do they get in? | Signup → first capture | > 70% within 24 h |
| Does it become a habit? | Captures in week 2 / week 1 | > 60% |
| Does the loop close? | Users with ≥ 1 completed commitment | > 50% |
| Does it reach them? | Digest open → app open within 2 h | > 30% |
| Is it trusted? | `sync_failed` events per active user per week | < 0.1 |
| Is it worth it? | "Saved by Memoire" records per user per week | ≥ 1 |

Every one of these is already instrumented in `src/utils/productAnalytics.ts`
except digest open, which lands with week 2.

---

## 6. Sequencing logic

Why this order, and not features first:

1. **Week 1 is trust** because every later week adds users, and adding users to
   a product that can lose their data multiplies the damage rather than the
   learning.
2. **Week 2 is delivery** because it is the largest gap between what the product
   promises and what it does, and because it is what makes week 3's activation
   work measurable — a user who never comes back cannot be activated.
3. **Week 3 is activation** because by then the app is safe and can reach out,
   so first-run improvements compound instead of leaking.
4. **Week 4 is launch** because the domain cutover, telemetry and QA are
   mechanical once the product is right, and they must not compete with product
   work for attention.

The riskiest item is 1.3/1.4: if the app turns out to be slow at 300 deals, the
fix could consume a week. That is why it is measured on day two rather than
discovered in week 4. If it does blow up, week 3's import work is the item to
cut — a new user can start with capture alone.
