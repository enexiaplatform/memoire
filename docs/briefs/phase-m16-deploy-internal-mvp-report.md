# Phase M.16 Deploy Internal MVP Report

## 1. Files Created

- `docs/deployment/internal-mvp-vercel-deploy.md`
- `docs/deployment/internal-mvp-smoke-test-checklist.md`
- `docs/briefs/phase-m16-deploy-internal-mvp-report.md`

## 2. Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## 3. Vercel Config Status

- Existing `vercel.json` was inspected.
- The Vite SPA fallback rewrite to `/index.html` already exists.
- The existing `/api/(.*)` rewrite was preserved ahead of the SPA fallback.
- No new deployment runtime, backend, database, auth, API key, or environment variable was added.

## 4. Warning/Privacy Notes Added

- Added an Internal MVP banner on `/app/pipeline-defense`:
  - Data is stored only in the current browser.
  - Users should not enter confidential customer information.
- Added a localStorage privacy note near the local save/status area.
- Added a shorter localStorage reminder in the secondary/admin action area.
- The banner lives in the app-only page shell and remains hidden from print.

## 5. Deployment Docs Added

- Added `docs/deployment/internal-mvp-vercel-deploy.md` with:
  - Vercel target
  - Vite SPA app type
  - Build command
  - Output directory
  - Route to test
  - localStorage notes
  - no-backend/no-auth warning
  - privacy caution
  - recommended Vercel access protection
  - post-deploy smoke test

## 6. Smoke Test Checklist Added

- Added `docs/deployment/internal-mvp-smoke-test-checklist.md` with direct-route, local persistence, import/export, print, review mode, risk analysis, readiness, action plan, warning banner, and no-API checks.

## 7. Route/Build/Lint Verification

- Route inspected: `/app/pipeline-defense`
- Local direct route check: `http://127.0.0.1:5173/app/pipeline-defense` returned HTTP 200 and served the Vite app root.
- Build command: `npm run build`
- Lint command: `npm run lint`
- Build status: passed.
- Lint status: passed with 5 pre-existing warnings in unrelated legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
- Targeted Pipeline Defense scan found no `fetch`, OpenAI, Claude, Gemini, API key, `VITE_`, `REACT_APP_`, `process.env`, or `import.meta.env` usage in the Pipeline Defense feature, utilities, or draft provider service.

## 8. Any Known Issues

- The broader repository still contains older app/backend-oriented code and dependencies outside the local-first Pipeline Defense MVP. Phase M.16 did not remove or re-architect those areas.
- Pipeline Defense deployment prep remains intentionally local-first and browser-storage based.

## 9. Git Status

- Phase M.16 modified `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`.
- Phase M.16 created the deployment docs listed above.
- The working tree also contains pre-existing Phase M files and related app changes from earlier phases.
