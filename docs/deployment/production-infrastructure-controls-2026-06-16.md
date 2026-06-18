# Memoire Production Infrastructure Controls

Date: 2026-06-16

Roadmap session: Session 3 - Production Infrastructure Controls

## Decision

For the first 5-10 person controlled early-access cohort, Memoire should use a layered control model:

1. Keep `X-Robots-Tag: noindex, nofollow` active.
2. Keep checkout inactive.
3. Protect expensive AI endpoints with Vercel Firewall rate limiting.
4. Keep application-level per-user limits as the second line of defense.
5. Use Deployment Protection, Vercel Authentication, Password Protection, or invite-only URL sharing if the cohort is not meant to be publicly reachable.
6. Keep Supabase Auth password strength enforced in the app; enable Supabase leaked-password protection when the project plan supports it.

This is enough to prepare for a small known cohort after Session 4 two-account QA passes. It is not enough for unrestricted public selling.

## Current Repo Evidence

Verified in repo:

- `vercel.json` applies `X-Robots-Tag: noindex, nofollow` to all routes.
- `vercel.json` applies `Cache-Control: no-store` to `/api/(.*)`.
- `api/_rateLimit.js` provides best-effort in-memory application rate limits.
- `api/_rateLimit.js` emits a consistent app-level `429` contract with `Retry-After` and `X-RateLimit-*` headers. See `docs/deployment/app-rate-limit-contract-2026-06-17.md`.
- Expensive endpoints require auth and have input limits:
  - `/api/ask-memoire`
  - `/api/search`
  - `/api/structure-capture`
  - `/api/capture-ai-classify`
  - `/api/generate-embedding`
- `src/auth/passwordPolicy.ts` enforces 12+ characters with uppercase, lowercase, number, and symbol.
- `.env.example` lists the required Supabase, AI, Stripe, and app URL variables.
- `.vercel/project.json` links the local repo to the Vercel project named `memoire`.
- `/api/health` provides a safe app-level readiness check for required production environment variables without exposing secret values.
- `/api/billing` requires `BILLING_CHECKOUT_ENABLED=true` before creating any Checkout session, even when Stripe keys and price IDs are configured.
- `/api/client-log` records allowlisted, sanitized client operational failures in serverless logs.

Missing current evidence:

- Active Vercel Firewall config.
- Active Vercel Deployment Protection setting.
- Production proof that app-level 429 responses include the expected rate-limit headers.
- Production environment variable audit.
- Production `/api/health` result.
- Production `/api/client-log` log-filter evidence.
- Production AI spend alert.
- Supabase Auth dashboard settings for leaked-password protection, CAPTCHA, redirect URLs, and auth rate limits.

## Vercel Firewall Plan

Use `docs/deployment/vercel-firewall-cohort-rules.json` as the source payload for the controlled-cohort firewall setup.

Minimum cohort setup:

- Enable Vercel Firewall.
- Enable Bot Protection in challenge mode.
- Enable AI Bot blocking in deny mode.
- Add one rate-limit rule for expensive AI endpoints:
  - Paths: `/api/ask-memoire`, `/api/search`, `/api/structure-capture`, `/api/capture-ai-classify`, `/api/generate-embedding`
  - Method: `POST`
  - Algorithm: fixed window
  - Window: 600 seconds
  - Limit: 120 requests
  - Key: IP
  - Exceeded action: deny

Why one rule:

- Vercel rate limiting is available on all plans.
- Hobby plans have only one rate-limit rule, so the first rule must cover the costly endpoints together.
- The app still applies stricter user-level limits inside each endpoint.
- App-level rate-limit responses are standardized, but they do not replace distributed Firewall enforcement.

Optional Pro setup:

- Add a separate `/api/request-access` rate-limit rule.
- Challenge obvious scripted API clients on `/api/*`.
- Add more granular endpoint-specific limits after observing real cohort traffic.

## Applying The Firewall Payload

Use the Vercel dashboard when possible:

1. Open the Vercel project named `memoire`.
2. Open Firewall.
3. Enable Firewall.
4. Enable Bot Protection in challenge mode.
5. Enable AI Bot blocking in deny mode.
6. Add the custom rate-limit rule from `docs/deployment/vercel-firewall-cohort-rules.json`.
7. Confirm the rule is active in production.

Alternatively, use the Vercel Firewall API from an operator machine with a local `VERCEL_TOKEN`.

Do not commit `VERCEL_TOKEN`.

Required identifiers:

- `projectId`: read from `.vercel/project.json`
- `teamId`: read from `.vercel/project.json`

Example API shape for one PATCH action:

```bash
curl -X PATCH "https://api.vercel.com/v1/security/firewall/config?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "firewallEnabled",
    "value": true
  }'
```

Important:

- The JSON file is an operator payload with grouped action lists, not a single raw PATCH body.
- If using the API directly, submit each object under `minimumRequiredPatchActions` as one PATCH body.
- Use the dashboard if this distinction is inconvenient.

## Deployment Protection Plan

Choose one access model before inviting the cohort:

| Model | Use When | Tradeoff |
| --- | --- | --- |
| Vercel Authentication | Cohort users can be added or authenticated through Vercel access controls. | Strongest platform gate, but awkward for external buyers who do not use Vercel. |
| Password Protection | You want simple shared access for a tiny known cohort. | Easier to share, weaker accountability. Rotate the password after the cohort. |
| Invite-only URL plus noindex | You want the lowest-friction validation flow. | Not a true access control; must rely on firewall, low cohort size, and monitoring. |
| Production open, app signup open | Only after Session 4 QA and monitoring pass. | Most realistic funnel, highest exposure. |

Recommended for first cohort:

- Use Password Protection or Vercel Authentication on preview deployments.
- Keep production noindex active.
- If production must be reachable, keep cohort invite-only and do not share broadly.

## Environment Variable Checklist

Required for controlled cohort:

- [ ] `SUPABASE_URL`
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `VITE_APP_URL`
- [ ] `ANTHROPIC_API_KEY` or `GROQ_API_KEY`
- [ ] `ANTHROPIC_MODEL` if using Claude
- [ ] `OPENAI_API_KEY` if semantic search or embeddings are enabled
- [ ] `VITE_ENABLE_DEMO_MODE=false` for production with real Supabase
- [ ] `VITE_ENABLE_FOUNDER_WORKSPACE=false` for customer-facing production

Optional for controlled cohort:

- [ ] `VITE_CAPTURE_AI_ENDPOINT=/api/capture-ai-classify`
- [ ] `CAPTURE_AI_PROVIDER`
- [ ] `CAPTURE_AI_ENDPOINT`
- [ ] `CAPTURE_AI_API_KEY`
- [ ] `CAPTURE_AI_MODEL`

Not required until paid checkout:

- [ ] `BILLING_CHECKOUT_ENABLED=true`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY`
- [ ] `STRIPE_PERSONAL_PRICE_ID`
- [ ] `STRIPE_TEAM_PRICE_ID`

Current decision:

- Keep `BILLING_CHECKOUT_ENABLED=false` and keep Stripe variables unset or test-only until Session 9 and Session 10 pass.
- `/pricing` should continue to describe pricing as a hypothesis.

## Supabase Auth Controls

Required before cohort:

- [ ] Confirm production Site URL is the deployed Memoire URL.
- [ ] Confirm production `/api/health` has no `app_url_valid`, `app_url_https`, or `app_url_not_localhost` issue.
- [ ] Confirm `/api/health` `authRedirects.requiredUrls` matches the Supabase Auth allowlist.
- [ ] Confirm redirect URLs include:
  - `/login?verified=1`
  - `/reset-password`
  - OAuth callback routes required by Supabase for the production domain
- [ ] Confirm email confirmation behavior matches the public signup copy.
- [ ] Confirm Google OAuth provider is configured for the production domain if Google sign-in is offered.
- [ ] Confirm default auth rate limits are acceptable for a 5-10 person cohort.

Password security:

- App-level policy already requires 12+ characters, uppercase, lowercase, number, and symbol.
- Supabase leaked-password protection should be enabled when the project plan supports it.
- If leaked-password protection is unavailable, document the app-level password policy as the accepted early-access mitigation and revisit before public selling.

Optional before public selling:

- CAPTCHA on signup, sign-in, and password reset.
- Custom SMTP to improve deliverability and raise email limits.
- Session lifetime controls if the project upgrades to a plan that supports them.

## Monitoring And Alerts

Minimum cohort monitoring:

- [ ] Production `/api/health` returns HTTP 200 with `ok: true`.
- [ ] Vercel function error rate.
- [ ] Vercel firewall/rate-limit events.
- [ ] Vercel bandwidth/function invocation spikes.
- [ ] Supabase Auth failures.
- [ ] Supabase database errors.
- [ ] Failed cloud writes reported by the app.
- [ ] Vercel logs can filter `cloud_json_sync_failed` and `pipeline_defense_cloud_sync_failed`.
- [ ] `/api/request-access` submission failures.
- [ ] AI provider usage/cost for Anthropic, Groq, OpenAI, and optional Capture AI provider.

Manual fallback for first cohort:

- Check `/api/health` after each production deploy and before each invite batch.
- Review Vercel logs daily during the first week.
- Search Vercel logs for `Memoire client operational event`, `cloud_json_sync_failed`, and `pipeline_defense_cloud_sync_failed`.
- Review Supabase logs daily during the first week.
- Review AI provider usage daily during the first week.
- Keep the cohort small enough that daily manual review is realistic.

## Verification Checklist

Before Session 3 can be marked operationally passed:

- [ ] Vercel Firewall is enabled.
- [ ] Expensive AI endpoint rate limit is active.
- [ ] Normal browser usage still works for demo and signed-in app.
- [ ] A scripted test receives HTTP 429 from Vercel when the WAF limit is exceeded.
- [ ] Application-level user rate limits still return app JSON 429s when exceeded.
- [ ] App-level 429 responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- [ ] `X-Robots-Tag: noindex, nofollow` is present on deployed public routes.
- [ ] `/api/health` returns HTTP 200 and `ok: true` on the deployed cohort environment.
- [ ] `/api/health` `authRedirects.requiredUrls` matches Supabase Auth Site URL and Redirect URL allowlist.
- [ ] Production env vars are checked against this runbook.
- [ ] Supabase Auth Site URL and Redirect URLs are checked.
- [ ] Supabase leaked-password protection is either enabled or explicitly deferred with the app-level password policy mitigation.
- [ ] Monitoring owners and daily review cadence are named.
- [ ] Operator can find `/api/client-log` events in Vercel logs.

## Current Status

Session 3 documentation is complete.

Operational status:

- Not passed yet, because the actual Vercel and Supabase dashboard controls have not been applied and verified from this local session.

Roadmap impact:

- A1 and A2 in the commercial release gate now have a concrete implementation plan.
- A7 now has a minimum monitoring checklist.
- Session 4 remains required before inviting real users.

## Next Session

Session 4 should run two-account auth, RLS, data isolation, demo isolation, export, and deletion QA.

First question for Session 4:

Can two separate signed-in users create, sync, export, and delete realistic pipeline data without seeing or resurrecting each other's records, and without demo data leaking into account mode?

## External References

- Vercel WAF Rate Limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Password Protection: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection
- Vercel Authentication: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication
- Supabase Password Security: https://supabase.com/docs/guides/auth/password-security
- Supabase Auth Rate Limits: https://supabase.com/docs/guides/auth/rate-limits
