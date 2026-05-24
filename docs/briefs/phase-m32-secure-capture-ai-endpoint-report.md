# Phase M.32 Secure Capture AI Endpoint Report

## Files Created

- `api/capture-ai-classify.ts`
- `api/_captureAiPrompt.ts`
- `docs/briefs/phase-m32-secure-capture-ai-endpoint-report.md`

## Files Modified

- `.env.example`
- `src/services/captureAiProvider.ts`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `docs/deployment/capture-ai-provider-setup.md`

## Endpoint Behavior

- Added `POST /api/capture-ai-classify`.
- Validates:
  - method is POST
  - JSON body exists
  - `rawNote` is present
  - `rawNote` is 4000 characters or fewer
  - `activityDate` uses `YYYY-MM-DD`
  - request body is not oversized
- Returns:
  - `405` for non-POST
  - `400` for invalid body
  - `503` when server AI env vars are missing
  - `502` when the provider call fails
  - `200` with normalized structured JSON on success

## Env Var Changes

Public frontend:

- `VITE_CAPTURE_AI_ENDPOINT=/api/capture-ai-classify`

Server-only:

- `CAPTURE_AI_PROVIDER=openai-compatible`
- `CAPTURE_AI_ENDPOINT`
- `CAPTURE_AI_API_KEY`
- `CAPTURE_AI_MODEL`

Deprecated/removed from `.env.example`:

- `VITE_CAPTURE_AI_API_KEY`
- `VITE_CAPTURE_AI_MODEL`

## Security Improvements

- Frontend no longer reads or sends any AI API key.
- Provider secret stays in server-only env vars.
- Endpoint does not log raw notes or customer data.
- Request sends only the note being classified plus lightweight account/opportunity context.
- The Capture UI warning now explains that AI Assist sends the note to a configured server-side endpoint.

## Frontend Behavior

- `src/services/captureAiProvider.ts` now calls the serverless endpoint only.
- Default endpoint is `/api/capture-ai-classify`.
- No `VITE_CAPTURE_AI_API_KEY` or `VITE_CAPTURE_AI_MODEL` usage remains in frontend provider code.
- If the endpoint returns `503`, the UI shows:
  - `AI Assist is not configured on the server. Local rules are still available.`

## Fallback Behavior

- Local rule-based preview remains available.
- Raw note remains in the textarea if AI fails.
- Save Activity still requires user confirmation.
- AI does not auto-update opportunities or accounts.

## What Remains Intentionally Not Built

- Gmail integration
- Google Calendar integration
- Salesforce/HubSpot integration
- external CRM sync
- automatic opportunity/account updates
- hardcoded API keys

## Build / Lint Status

- Build: passed with `npm run build`.
- Lint: passed with `npm run lint`; 5 known pre-existing hook dependency warnings remain in legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts` (2 warnings)
- Local route smoke check: passed for `/app/capture`, `/app/dashboard`, `/app/calendar`, `/app/reviews`, `/app/accounts`, `/app/opportunities`, and `/app/pipeline-defense`.
