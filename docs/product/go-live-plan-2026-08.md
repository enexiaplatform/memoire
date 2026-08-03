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

### P0-2 · Reaching the user outside the app — built 2026-08-02

The promise is "nothing goes silent", and every mechanism behind it — going-quiet
detection, overdue commitments, stuck money, the weekly review — only fired while
somebody was already looking at the app. `src/utils/dailyDigest.ts` even built a
`subject` and a `plainText` body: written to be sent, never sent.

There is now a scheduled send. An hourly Vercel cron works out whose local hour
has arrived — 7am has to mean 7am where the operator is — builds their digest on
the server from their own cloud records, and emails it. Monday brings the weekly
one instead of the daily.

Four decisions worth keeping:

- **Off until asked.** Both preferences default to false in the database, not
  just in the interface. A product that starts emailing on signup has decided
  the user's inbox is worth its output.
- **Silence when there is nothing to say.** A morning with nothing overdue sends
  nothing. An email that arrives daily to report that all is well trains the
  operator to filter the one that matters.
- **No tracking, no unescaped customer text.** No pixel, no image, no remote
  font. The whole trust position is that customer context stays where the
  operator put it.
- **Deliberately small.** The server digest answers three questions from columns
  that exist rather than reproducing the app's full record graph on the server.
  Two copies of that model would disagree eventually, and the day they did, the
  email would be lying about the app. It nudges and links in.

**Remaining:** it needs `CRON_SECRET`, `EMAIL_API_KEY` and `EMAIL_FROM` in
Vercel plus the migration applied — Step 3b of the launch runbook. The guard
paths (unauthenticated cron, bad unsubscribe token, wrong verb) were exercised
against a stub; a real send needs a live Supabase and a verified sending domain,
so first delivery is a launch-week task, not something that could be proven
here.

### P0-3 · Cloud restore — built 2026-08-02

Settings used to say it plainly: browser restore rewrites the local copy;
restoring into a signed-in workspace can be overwritten by cloud sync, so
"restore while signed out, check, then sign in". Honest, and an admission that
the backup only half worked.

A restore now goes all the way. It snapshots the workspace it is about to
replace, clears the app's own keys so a restore replaces rather than merges,
writes every collection through the guarded path (restoring a full backup is
exactly when a browser runs out of room), and - for a signed-in user - pushes
every collection that has a cloud table up to the account and claims ownership,
awaited, so the next sync agrees with the file instead of overwriting it.

It then shows what actually landed: before and after in records, per collection,
with a column saying whether the account copy accepted it. And it can be undone
in one click, which the old confirmation said was impossible.

Collections without a cloud table are reported as browser-only rather than
implied to be safe. The contract fails if a table exists in the cloud registry
and the restore does not know where to push it.

**Remaining:** accounts, deals, activities, stakeholders and objections sync
through their own stores rather than the JSON collection registry, so a restore
puts them in the browser and their own sync carries them up. Routing those
through the same path is a follow-on. **Effort: 1 day.**

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

### P0-5 · Behaviour at real scale — now measured (2026-08-02)

The founder's own import is 122 opportunities and the next users arrive with
more. Nobody had measured 300.

**Measured since.** `npm run verify:performance-budget` builds a synthetic book
(300 deals / 900 activities / 200 accounts / 250 quotes) and times the derived
models in Node; `npm run measure:surfaces` loads the same workspace into a
browser against a production build and times each destination to content.

Derived models, at that scale:

| Model | Time | Budget |
|---|---|---|
| masterDashboard | 23 ms | 400 ms |
| businessLens | 7 ms | 250 ms |
| orderBook | 7 ms | 250 ms |
| outcomeScoreboard | 2 ms | 250 ms |
| resolveCommercialThreads | 11 ms | 600 ms |

Surfaces, same workspace, production build, 1.45 MB stored:

| Surface | To content (2026-08-02) | After the fixes below |
|---|---|---|
| Opportunities | 413 ms | 469 ms |
| Accounts | 539 ms | 486 ms |
| Orders | 504 ms | 527 ms |
| Review | 533 ms | 529 ms |
| Plan | 369 ms | 425 ms |
| Dashboard | 365 ms | 376 ms |
| Activity | 1,134 ms | 1,172 ms |
| **Today** | **4,475 ms** | **2,760 ms** |

So the answer is: **the product holds at scale except on Today**, which is the
landing page after login and takes four and a half seconds to show anything.

A CPU profile of that cold load attributes it to bundled utility chunks -
pipeline-defense and sales-playbook work, cloud-JSON record sanitising, account
identity resolution - not to rendering (877 DOM nodes) and not to the five core
models above. The heavy insight builder on that page is already gated behind a
disclosure and memoised, so the cost is in the always-on path.

**Fixed since (2026-08-02).** Profiling with real function names found the cost
was not in the product's logic at all - it was in formatter construction.
`Intl.NumberFormat` was being built once per money value on screen and
`Intl.DateTimeFormat` once per date, which at 300 deals came to 4.0 s and 1.8 s
of CPU respectively. Both are now built once. `isValidBusinessDate`, one of the
most-called functions in the app, no longer allocates a `Date` to find out
whether the 31st of February exists; `normalizeEntityName` is memoised; the
competitor regexes in the MEDDIC review are compiled once instead of seven per
call.

Today went from 4,475 ms to 2,760 ms, a 38% cut, and because every one of those
fixes is in shared code it applies to every surface and every re-render, not
only to the cold load being measured.

**Remaining work:** Today is still over the 1.5 s target. What is left is spread
thin rather than concentrated - roughly 300 ms of it is the deal action plan
reached through the Today command centre, and the rest is a 2,700-line page that
computes fifteen memos on mount over a workspace of sixteen collections. A
bisect confirmed the heavy insight builders behind the disclosure are correctly
gated and do not run on the cold path. The next move is to defer or virtualise
what the first screen does not need, which is surgery on the most important page
in the product and should be its own change with `measure:surfaces` proving it.
**Effort: 1 day.**

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
| 1.1 | ~~Dashboard renders in browser-only mode~~ **done 2026-08-02** | Guard removed; contract checks all twelve routed surfaces for auth-gated blank renders |
| 1.2 | ~~Storage write guard + usage meter~~ **done 2026-08-02** | One guarded write path across 24 stores, an undismissable banner, a storage panel in Settings, `verify:storage-safety` |
| 1.3 | ~~Scale harness + budgets~~ **done 2026-08-02** | `verify:performance-budget` in CI; `measure:surfaces` for the browser side; numbers recorded under P0-5 |
| 1.4 | Fix Today's cold load — **4,475 → 2,760 ms on 2026-08-02**, target not yet met | Today under 1.5 s at 300 deals, proven with `measure:surfaces` |
| 1.5 | ~~Cloud restore, transactional~~ **done 2026-08-02** | Snapshot + undo, guarded writes, cloud push per collection, before/after counts in the interface |

**Gate:** a workspace with 300 deals is usable end to end, and a backup taken on
Monday restores on Friday into the same account.

### Week 2 (Aug 11–17) · Nothing goes silent, even when the app is closed

The week that makes the promise true.

| # | Work | Done when |
|---|------|-----------|
| 2.1 | ~~Delivery infrastructure~~ **done 2026-08-02** | Hourly Vercel cron, `CRON_SECRET`-authenticated, one function (9 of 12 used); the unsubscribe rides the same function on GET |
| 2.2 | ~~Daily digest email~~ **done 2026-08-02** | Overdue, gone quiet, stuck money — sent at the operator's local hour, only when there is signal |
| 2.3 | ~~Weekly review email~~ **done 2026-08-02** | Monday: what closed, what is still open |
| 2.4 | ~~Preferences + unsubscribe~~ **done 2026-08-02** | Off by default, hour and local offset in Settings, one-click unsubscribe with no session, every attempt logged in `digest_deliveries` |
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
