# Phase M.17 Pre-Deploy Hardening Report

## Files Created

- `docs/deployment/internal-mvp-route-boundary.md`
- `docs/deployment/internal-mvp-known-warnings.md`
- `docs/deployment/pre-deploy-hardening-checklist.md`
- `docs/briefs/phase-m17-pre-deploy-hardening-report.md`

## Files Modified

- `src/App.tsx`

## Route Exposure Findings

- Primary internal MVP route: `/app/pipeline-defense`
- Pipeline Defense is visible in the sidebar.
- Sidebar also exposes `/app/today`, `/app/journey`, `/app/accounts`, `/app/opportunities`, `/app/ask`, and `/app/settings`.
- Public routes still exist for landing, auth, pricing, and demo flows.
- Legacy V0 routes still exist only as redirects to current V1 routes.
- The broader app remains deployable, so the deployment should be treated as internal/private unless the route surface is narrowed later.

## Bundle Warning Findings

- Before Phase M.17, Vite emitted a large single-bundle warning.
- Route pages were imported eagerly from `src/App.tsx`.
- Phase M.17 changed route page imports to React lazy-loaded route chunks.
- After the change, `npm run build` no longer emits the large bundle warning.
- The largest emitted chunks after route splitting are `index` and `useAuth`, both below the default warning threshold.

## Lint Warning Findings

- `npm run lint` passes with 5 known warnings.
- The warnings are `react-hooks/exhaustive-deps` warnings in older hooks outside Pipeline Defense:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
- These warnings do not block internal Pipeline Defense deployment.

## Network/API Guard Findings

- Targeted Pipeline Defense scan found no:
  - `fetch`
  - `XMLHttpRequest`
  - `axios`
  - OpenAI
  - Claude
  - Gemini
  - API key strings
  - `VITE_`
  - `REACT_APP_`
  - `process.env`
  - `import.meta.env`
- The broader repo still contains older API and Supabase-oriented code outside Pipeline Defense.

## Vercel Config Findings

- Existing `vercel.json` preserves `/api/(.*)` routes.
- Existing SPA fallback rewrites all other paths to `/index.html`.
- This supports direct refresh on `/app/pipeline-defense`.
- No Vercel config change was needed.

## Changes Made

- Added internal route boundary documentation.
- Added known lint warning documentation.
- Added pre-deploy hardening checklist.
- Lazy-loaded route page components in `src/App.tsx` to split route chunks and remove the large bundle warning.

## What Remains Intentionally Not Changed

- No backend, database, auth, real AI, API key, CRM sync, Gmail sync, or network request was added.
- Legacy routes were not removed.
- Older API files and broader app code were not removed.
- Lint warnings in older hooks were documented rather than fixed to avoid behavior changes before deploy.

## Build/Lint Status

- `npm run build`: passed.
- `npm run lint`: passed with 5 documented warnings.
- Direct refresh check: `http://127.0.0.1:5173/app/pipeline-defense` returned HTTP 200 and served the Vite app shell.
