# Launch operations

What to do when something goes wrong after the door is open, written before it
does. Everything here assumes one operator - the founder - because that is who
is on call.

The companion documents are `founder-launch-runbook.md` (getting the
environment right, once) and `post-deploy-verification.md` (proving a specific
deploy is good). This one is about the days after.

---

## Before opening the door

```bash
npm run check                                    # every contract, on the code
npm run build && npx vite preview --port 5299 &
npm run measure:surfaces -- --base http://localhost:5299   # render at 300 deals
npm run measure:mobile   -- --base http://localhost:5299   # 390px + keyboard
npm run preflight:production -- --base https://memoire-official.com
```

`check` proves the code. The two `measure:` commands prove it stays usable at a
real book of business and on a phone. `preflight:production` proves the
deployment - the domain, the health endpoint, the cron authentication, the
service worker, deep links - because none of those are facts about the code and
all of them have broken a launch before.

Four things the preflight cannot check, and you must do by hand on the live
host, in one sitting:

1. Sign up with a real address and click the verification link.
2. Ask for a password reset and confirm the link points at this host.
3. Confirm `client-log` entries and `product_events` rows are arriving.
4. Turn the daily digest on for your own account and wait for one to arrive.

---

## The four things that can go wrong, in order of how much they cost

### 1. A user's data is not saved

**How you find out:** a `local_write_failed` operational event, or a user says
something they typed is gone.

The product writes to the browser first and the account second, so this is
almost always the browser's storage ceiling rather than the cloud. The
undismissable banner is already telling the user; your job is to find out
whether the record reached the account.

- Settings → Storage shows what the workspace is costing this browser and
  which collection is largest.
- If they are signed in, the record is probably in Supabase even though the
  local write failed. Check `sales_activities` / `opportunities` by `user_id`
  and `created_at` before telling anyone anything is lost.
- Immediate relief: Settings → Export writes a full JSON backup, then archived
  or sample data can be removed to free room.

**Do not** tell a user their data is safe until you have seen the row.

### 2. Nothing is reaching the operator

**How you find out:** no digests arrived, or `digest_deliveries` has no rows
for a day when it should.

The sender is a single hourly Vercel cron. Failures are almost always one of
three things, in this order:

- `CRON_SECRET` unset or changed. The endpoint refuses rather than sends when
  the secret is missing - that is deliberate - so an unset secret looks
  identical to a quiet day.
- `EMAIL_API_KEY` / `EMAIL_FROM` unset. Check `/api/health`.
- Genuinely nothing to say. The digest sends only when there is signal; a
  morning with nothing overdue sends nothing, and that is correct behaviour,
  not an outage.

`digest_deliveries` distinguishes them: a row with `status: 'sent'` means it
left, no row at all means it was never attempted, and a row with an error
means the provider refused it.

### 3. The app is slow or will not open

**How you find out:** a user says it hangs, or your own workspace does.

- If it will not open at all on a phone, suspect the service worker first.
  A user can clear it: Settings → Storage, or in the browser's application
  settings, unregister the worker and reload. The worker is versioned by cache
  name and a deploy clears every older cache, so a bad shell cannot survive a
  deploy - but it can survive until the user gets one.
- If it opens but crawls, it is a scale problem, and `npm run
  verify:surface-scale` is the first thing to run against the current code. It
  measures growth rather than milliseconds: doubling the book should roughly
  double the work. A ratio near four is a join or a per-record recomputation
  that was added since.
- Get the user's record counts before theorising. Settings → Storage shows
  them, and 300 deals behaves nothing like 3,000.

### 4. A user cannot sign in

Almost always the domain. `app_url_matches_request_host` in `/api/health` is
the single fact that matters: if the app is served from a host that `APP_URL`
does not name, every verification and reset link points somewhere else. Step 1
of the founder runbook fixes it, and it must be done in one sitting with the
Supabase URL configuration.

---

## Rolling back

Vercel keeps every previous deployment. Promoting the last known-good one is
the fastest fix for anything introduced by a deploy, and it is always the right
first move when you are not sure what broke.

```
Vercel → Project → Deployments → the last green one → Promote to Production
```

Then run `npm run preflight:production` against the live host to confirm what
you promoted is actually serving.

**What a rollback does not undo:** a database migration. The migrations here
are additive - new columns with defaults, new tables - so an older build runs
against a newer schema without noticing. Never write a migration that drops or
renames a column that the currently-deployed build reads; if one is
unavoidable, ship it in two deploys with the read removed first.

**Rehearse it once before launch**, on a day when nothing is wrong, so the
first time you promote a deployment is not the first time you have found the
button.

---

## What to watch in the first two weeks

The numbers that say whether the product works are in
`docs/product/go-live-plan-2026-08.md`. The ones that say whether it is
*healthy* are these, and all of them are already instrumented:

| Signal | Where | What bad looks like |
|---|---|---|
| `local_write_failed` | operational events | more than zero, ever |
| `sync_failed` | operational events | above 0.1 per active user per week |
| digest sends | `digest_deliveries` | no rows on a day with overdue work |
| cold load | `measure:surfaces` | any destination over 2000ms at 300 deals |

A single `local_write_failed` is worth a phone call to that user. It is the
only signal here that means a record may not exist anywhere.

---

## Standing rules

- Fix the user's problem before diagnosing the cause. Their export is one
  click away and it costs nothing.
- Never claim a record is safe without having seen it.
- A quiet digest is not a broken digest. Check `digest_deliveries` before
  changing anything about the sender.
- Every env change is followed by `npm run preflight:production`.
