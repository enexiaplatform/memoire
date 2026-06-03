# Phase M.35 Capture Extraction v2 Report

## Files created
- `docs/database/supabase-sales-activities-extraction-v2-migration.sql`
- `docs/qa/phase-m35-capture-extraction-v2-test-cases.md`
- `docs/briefs/phase-m35-capture-extraction-v2-report.md`

## Files modified
- `src/utils/salesActivityClassifier.ts`
- `src/services/salesActivityStore.ts`
- `src/services/captureAiProvider.ts`
- `src/utils/captureAiPrompt.ts`
- `api/_captureAiPrompt.ts`
- `api/capture-ai-classify.ts`
- `src/utils/activityOpportunityLinker.ts`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/utils/salesActivityRecap.ts`

## Schema changes
- Added an additive Supabase migration doc for:
  - `contact_name`
  - `stakeholder_name`
  - `stakeholder_role`
  - `competitors`
  - `buying_signals`
  - `risks`
  - `timeline_signals`
  - `next_actions`
- Existing columns and RLS policies are not changed.

## Extraction improvements
- Rule-based extraction now handles contact/account phrases like `Met with Dr. Avery at Apex Labs`.
- Competitor extraction detects phrases like `Competitor Incumbent Vendor`.
- Buying signal extraction detects budget approval and similar confirmed evidence.
- Timeline extraction detects `next quarter`, `this quarter`, `next month`, and similar timeline phrases.
- Multi-action extraction separates actions like:
  - `send revised quote by Friday`
  - `follow up with procurement next Tuesday`
- Backward compatibility is preserved by filling `nextAction` and `dueDate` from the first extracted action.

## AI schema changes
- Frontend and serverless AI schemas now include:
  - `contactName`
  - `stakeholderName`
  - `stakeholderRole`
  - `nextActions`
  - `competitors`
  - `buyingSignals`
  - `risks`
  - `timelineSignals`
- Serverless endpoint normalizes omitted or malformed fields safely.
- No raw note/customer data is logged.

## UI changes
- Capture structured preview shows contact/stakeholder, competitors, buying signals, risks, timeline signals, and detected next actions.
- Editable fields were added for simple string/list values.
- Calendar activity detail shows richer extraction fields.
- Reviews now treat extracted `nextActions` as open next actions.

## Backward compatibility behavior
- Existing activity records without v2 fields load with empty arrays/strings.
- Existing `nextAction` and `dueDate` remain supported.
- Cloud inserts require the additive Supabase migration for v2 fields; if cloud save fails before migration, local fallback still preserves the activity.

## What remains intentionally not built
- No Gmail integration.
- No Google Calendar integration.
- No Salesforce/HubSpot or external CRM sync.
- No embeddings or vector matching.
- No automatic account/opportunity updates without user confirmation.

## Build/lint status
- `npm run build`: passes.
- `npm run lint`: passes with the 5 known pre-existing hook dependency warnings.

## Fixture verification
- Tested the Apex Labs fixture against the production build output.
- Extracted:
  - `accountName`: `Apex Labs`
  - `opportunityName`: `Validation Expansion`
  - `contactName` / `stakeholderName`: `Dr. Avery`
  - `stakeholderRole`: `Doctor`
  - `competitors`: `Incumbent Vendor`
  - `buyingSignals`: `Budget approved`
  - `timelineSignals`: `Next quarter`
  - `nextActions`:
    - `Send revised quote`, due `2026-05-29` when activity date is `2026-05-25`
    - `Follow up with procurement`, due `2026-05-26` when activity date is `2026-05-25`
