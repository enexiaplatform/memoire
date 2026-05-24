# Phase M.31 AI Capture Classification Report

## Files Created

- `src/services/captureAiProvider.ts`
- `src/utils/captureAiPrompt.ts`
- `docs/deployment/capture-ai-provider-setup.md`
- `docs/briefs/phase-m31-ai-capture-classification-report.md`

## Files Modified

- `src/features/dailyCapture/DailyCapturePage.tsx`
- `.env.example`

## AI Provider Behavior

> Phase M.32 supersedes the original client-side env shape. Capture AI now uses a secure serverless endpoint and server-only provider secrets.

- Added a Capture AI provider abstraction.
- Active provider IDs:
  - `disabled`
  - `openai-compatible`
- The OpenAI-compatible provider now calls the server-side endpoint configured by:
  - `VITE_CAPTURE_AI_ENDPOINT=/api/capture-ai-classify`
- No API key is hardcoded.
- No provider API key is exposed in the frontend.

## Local Fallback Behavior

- Existing rule-based classification remains the default safe path.
- `/app/capture` still works with no AI env vars.
- If AI classification fails, the raw note remains intact and local rules remain available.

## Prompt / Output Contract

- Prompt builder asks for strict JSON only.
- Allowed activity types:
  - Customer meeting
  - Follow-up
  - Demo / technical discussion
  - Quote / proposal
  - Tender / procurement
  - Internal coordination
  - Objection handling
  - Admin / CRM
  - Other
- Output includes:
  - `activityType`
  - `accountName`
  - `opportunityName`
  - `summary`
  - `nextAction`
  - `dueDate`
  - `tags`
  - `suggestedOpportunityId`
  - `confidence`
  - `reasoning`

## UI Behavior

- Daily Capture shows AI provider status.
- If configured, user can click `Classify with AI`.
- AI suggestion appears separately from the local preview.
- User must click `Accept suggestion` before it becomes the editable structured preview.
- Structured preview fields are editable before save.
- Saving still requires explicit user action.

## Privacy / Security Behavior

- A warning appears when AI is configured:
  - AI Assist may send the note to the configured provider.
  - Users should avoid confidential customer data unless provider approval exists.
- Only lightweight context is sent:
  - account name, segment, industry
  - opportunity name, stage, product/solution
- No full history, account notes, opportunity evidence, or pipeline defense briefs are sent.
- Raw customer notes are not logged in production console.

## Preserved Behavior

- localStorage mode still works.
- Supabase cloud mode still works.
- Save Activity still works.
- Link-to-opportunity suggestions still work after saving.
- Calendar, Reviews, Accounts, Opportunities, Dashboard, and Pipeline Defense remain unchanged.

## What Remains Intentionally Not Built

- Gmail integration
- Google Calendar integration
- Salesforce/HubSpot integration
- external CRM sync
- automatic opportunity/account updates
- real AI when env vars are missing
- server-side AI proxy

## Build / Lint Status

- Build: passed with `npm run build`.
- Lint: passed with `npm run lint`; 5 known pre-existing hook dependency warnings remain in legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts` (2 warnings)
- Local route smoke check: passed for `/app/capture`, `/app/dashboard`, `/app/calendar`, `/app/reviews`, `/app/accounts`, `/app/opportunities`, and `/app/pipeline-defense`.
