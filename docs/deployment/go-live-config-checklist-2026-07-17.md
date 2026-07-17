# Go-live configuration checklist (2026-07-17)

The product features are built and deployed. What remains to make the live app
behave exactly as designed is **operator configuration** — secrets and
infrastructure that Claude cannot and must not set. This is the checklist.

## 1. Environment variables (set in Vercel → Project → Settings → Environment Variables)

| Variable | Status (as last known) | What to set | Why it matters |
| --- | --- | --- | --- |
| `VITE_APP_URL` | Set, but to the wrong host (`memoire.vercel.app`, not owned) | The real production origin, e.g. `https://memoire-blush-eta.vercel.app` (or the custom domain once attached) | Used to build absolute links (including the new **manager share link**). A wrong host makes shared links point nowhere. |
| `OPENAI_API_KEY` | Missing | A valid OpenAI API key | Powers AI capture (natural-note → structured activity/deal/risk). Without it, the product's "magic" first-run moment is off in production. |
| Generation key (`VITE_*` publishable, per current setup) | OK | — | Already configured. |

After changing env vars, **redeploy** (Vercel does not apply new env to existing
builds). Verify via the deployment's runtime, not just the dashboard.

## 2. Scheduled outbound email (the "true" digest delivery)

The **daily digest content** now ships in-app (Dashboard → Daily digest → Copy /
Email to myself). A digest that *arrives in the inbox without opening the app*
needs two things the operator provisions:

- **An email service** (Resend, Postmark, SendGrid, or SES) with its own API key.
- **A scheduler** to send on a cadence. Options:
  - Vercel Cron → an API route. **Blocked today**: `api/` is at the Hobby
    12-function cap. Requires either upgrading the plan or consolidating routes
    first (see the Vercel Hobby function-limit note).
  - An external scheduler (GitHub Actions cron, Supabase scheduled Edge Function)
    calling a send endpoint — avoids adding a Vercel function.

Decision needed: **which email service**, and **which scheduler path** (upgrade
Vercel vs external cron). Once chosen, wiring `buildDailyDigest` output into a
send job is small.

## 3. Cohort onboarding (the validation gate)

The cohort qualification console + stop/go calculator are already built. What is
missing is **3–5 real users** run through 2–3 weeks so the stop/go calculator has
data to judge. This is outreach, not code:

- Confirm env config (section 1) so first-run is the real experience.
- Send the cohort outreach templates (already in `docs/product/`).
- Let the stop/go calculator do its job at the end of the window.

## Summary of who does what

- **Claude (done):** money-out + cash position, post-won watch, own-obligations
  watch, manager share link, in-app daily digest.
- **Operator (you):** set the two env vars + redeploy; choose an email service +
  scheduler for true digest delivery; run the real cohort.
