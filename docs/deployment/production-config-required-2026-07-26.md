# Production configuration still required

Date: 2026-07-26
Status: **operator action** — these cannot be fixed in code, and each was verified against live production before this document was written.

Production probe at time of writing:

```json
{"ok":false,"summary":{"requiredPassed":6,"requiredFailed":1,"warnings":1},
 "authRedirects":{"appUrlHost":"memoire.vercel.app","requestHost":"memoire-blush-eta.vercel.app"}}
```

Two real misconfigurations, plus one that this refactor fixes on deploy.

---

## 1. `VITE_APP_URL` points at a domain this deployment does not serve — CRITICAL

**Current:** `VITE_APP_URL = https://memoire.vercel.app`
**Serving host:** `memoire-blush-eta.vercel.app`

Every auth email Supabase sends is being built against a host this project does not own. Anyone completing signup or a password reset is sent to a stranger's domain.

**Fix — Vercel → Project Settings → Environment Variables (Production):**

```text
VITE_APP_URL = https://memoire-blush-eta.vercel.app
```

**Fix — Supabase → Authentication → URL Configuration:**

- Site URL: `https://memoire-blush-eta.vercel.app`
- Redirect allowlist (full URLs, same host):
  - `https://memoire-blush-eta.vercel.app/login?verified=1`
  - `https://memoire-blush-eta.vercel.app/reset-password`
  - `https://memoire-blush-eta.vercel.app/app/today`

Redeploy, then confirm `app_url_matches_request_host: true`.

> The app itself builds auth redirects from `window.location.origin`, so the running app is self-consistent. What is wrong is the Supabase allowlist and Site URL, which this variable is supposed to mirror. Health compares the two so the drift cannot stay silent.

---

## 2. An AI provider key is set in production — remove it

`ai_generation_provider` passes today, which means `ANTHROPIC_API_KEY` or `GROQ_API_KEY` is present in the Vercel environment. Memoire has no AI dependency and never calls one; the key is a paid credential exposed for nothing.

**Fix — Vercel → Environment Variables (Production):** delete `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GROQ_API_KEY`, `OPENAI_API_KEY`, and any `CAPTURE_AI_*`.

After this refactor deploys, `/api/health` reports a `no_ai_provider_configured` warning while any of them remain.

---

## 3. `openai_embeddings` — fixed by this deploy, no action needed

The one failing required check was demanding an OpenAI key for embeddings that no longer exist. Both AI checks are removed; production health goes green on this without any configuration change.

---

## 4. Apply the new migrations

**Supabase → SQL Editor**, in order:

1. `supabase/migrations/20260726140000_commercial_kernel.sql` — threads, commitments, events, value outcomes. Additive and idempotent; re-running is a no-op.
2. `supabase/migrations/20260726160000_product_events.sql` — the analytics table.

Nothing is altered or dropped. `product_funnel_events` is left exactly as it is, so historical rows and any query against them keep working.

Verify:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('commercial_threads','commercial_commitments',
                     'commercial_events','commercial_value_outcomes','product_events');
```

Five rows. Then confirm RLS is on and anon has nothing:

```sql
select relname, relrowsecurity from pg_class
where relname in ('commercial_threads','commercial_commitments',
                  'commercial_events','commercial_value_outcomes','product_events');
```

Until the kernel migration is applied, commitments and threads still work — they are written to localStorage and the cloud upsert fails quietly into a sync warning. They will not reach a second device.

---

## 5. Optional

- `VITE_CLIENT_LOG_ENDPOINT = /api/client-log` — without it the error reporter and sync telemetry stay inert by design.
- `VITE_ENABLE_BUSINESS_ACCOUNTING` — leave unset. Setting it to `true` returns expense logging and the profit-and-loss statement, which are outside the beta proposition.

---

## Verification after all changes

```bash
curl -s https://memoire-blush-eta.vercel.app/api/health
```

Expect `ok: true` and `warnings: 0`. Then walk section A of `docs/qa/focused-refactor-qa-2026-07-26.md`.

---

## Function budget

Vercel Hobby allows 12 serverless functions. `api/` now holds 8: `billing`, `client-log`, `delete-account`, `export`, `health`, `product-events`, `request-access`, `lemonsqueezy-webhook`. Files prefixed with `_` are shared modules, not functions, so `_lemonsqueezy.js` does not count. Four spare — count before adding another.
