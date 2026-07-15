# API Function Headroom Plan

Date: 2026-07-15
Status: READY TO EXECUTE - deliberately not executed yet (see decision below).

## The constraint

`api/` is at the Vercel Hobby **12-function cap**. The 12 (excluding `_`-prefixed shared helpers, which are not routes):

`ask-memoire`, `billing`, `capture-ai-classify`, `client-log`, `delete-account`, `export`, `generate-embedding`, `health`, `request-access`, `search`, `stripe-webhook`, `structure-capture`.

None are dead: `billing`/`stripe-webhook` are Phase-2 groundwork, `health` is probed externally, the rest have live client callers. So headroom requires **consolidation**, not deletion. (The dead *client* code that called two phantom endpoints - `/api/claude-extract`, `/api/anonymize` - was removed in b015f6c; those were never on disk, so they never counted against the cap.)

## The decision: don't churn now

Preemptively merging live endpoints - purely to free a slot with **no 13th endpoint queued** - is churn on production-critical code that cannot be exercised locally (Vite serves the SPA, not the Vercel functions). The risk (a subtle merge bug degrading live capture) outweighs the benefit (speculative headroom). This plan makes the merge a turnkey ~1-hour job the moment a real 13th endpoint is needed.

## The safe merge (when a 13th endpoint is needed)

Merge **`capture-ai-classify` + `structure-capture`** into one `api/capture-ai.ts`, dispatched by a `mode` field. Why this pair:

- Both are capture-AI, non-destructive, and already **degrade gracefully** to local rules on failure (`src/services/captureAiProvider.ts` and `src/features/v31/salesMemory.ts` both catch and fall back). A merge bug therefore soft-degrades AI capture rather than crashing - the safest possible failure mode for a first consolidation.
- Both already share helpers (`_captureAiPrompt.js`, `_auth.js`, `_rateLimit.js`), so the merge is mostly moving two handler bodies behind a switch.
- Neither is destructive (unlike `delete-account`) or externally called on a fixed path (unlike `stripe-webhook`).

### Steps

1. Create `api/capture-ai.ts` that reads `req.body.mode` (`'classify'` | `'structure'`) and calls the corresponding existing handler logic, preserving each request/response shape **exactly**.
2. Point the two callers at it with the mode:
   - `src/services/captureAiProvider.ts` (currently `/api/capture-ai-classify`, honoring `VITE_CAPTURE_AI_ENDPOINT`) -> `/api/capture-ai` with `mode: 'classify'`.
   - `src/features/v31/salesMemory.ts` (currently `/api/structure-capture`) -> `/api/capture-ai` with `mode: 'structure'`.
3. Delete `api/capture-ai-classify.ts` and `api/structure-capture.ts`. Function count: **12 -> 11**.
4. `npm run check` (build + typecheck:api + contracts). Note: `verify-cloud-json-runtime` / capture contracts may reference the old endpoint names - update them in the same change.

### Post-deploy verification (the part that can't be done locally)

After the Vercel deploy is READY, curl the merged endpoint for both modes against production and confirm a sane response (auth will 401 without a token - that alone proves the route exists and rejects correctly; a full check needs a valid token):

```
curl -sS -X POST https://memoire-blush-eta.vercel.app/api/capture-ai \
  -H 'content-type: application/json' -d '{"mode":"classify","rawNote":"..."}'
curl -sS -X POST https://memoire-blush-eta.vercel.app/api/capture-ai \
  -H 'content-type: application/json' -d '{"mode":"structure","rawNote":"..."}'
```

Then drive a real capture in the app and confirm AI classification still populates (not the local-rules fallback). If it silently fell back, the merge is wrong - roll back the deploy immediately (the previous deployment is one click in the Vercel dashboard).

## If more than one slot is ever needed

Second-safest merge: `export` + `delete-account` into `api/account-data.ts` behind an `action` field (both are low-traffic Settings operations). Do this one **second** and with extra care - `delete-account` is destructive, so its post-deploy check must use a throwaway account.

The real fix for sustained growth is upgrading off Hobby; consolidation buys one or two slots, not a platform.
