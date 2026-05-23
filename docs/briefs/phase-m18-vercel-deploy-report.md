# Phase M.18 Vercel Deploy Report

## Files Created

- `docs/deployment/post-deploy-verification.md`
- `docs/briefs/phase-m18-vercel-deploy-report.md`

## Files Modified

- `docs/deployment/internal-mvp-vercel-deploy.md`

## Deployment Status

- Prepared only.
- Deployment was not executed from this environment because the Vercel CLI is not installed.
- No production deployment was attempted without explicit confirmation and access-protection verification.

## Deployment Command/Status

- `vercel --version`: unavailable; `vercel` command is not installed.
- `.vercel/project.json` exists and points to the Vercel project named `memoire`.
- Manual deployment commands were added to the deployment notes.

## Deployed URL

- Not available. No deployment was executed in Phase M.18.

## Build/Lint Status

- `npm run build`: passed.
- `npm run lint`: passed with 5 documented pre-existing hook dependency warnings outside Pipeline Defense.
- Targeted Pipeline Defense guard scan found no `fetch`, `XMLHttpRequest`, `axios`, OpenAI, Claude, Gemini, API key, `VITE_`, `REACT_APP_`, `process.env`, or `import.meta.env` usage.

## Vercel Config Summary

- `vercel.json` preserves `/api/(.*)` routes.
- `vercel.json` rewrites all other routes to `/index.html`.
- The SPA fallback supports direct refresh on `/app/pipeline-defense`.
- No Vercel config change was needed.

## Local-First Privacy Warning

- Pipeline Defense remains local-first.
- Brief data is stored in browser `localStorage`.
- Users should not enter confidential customer information unless deployment access controls and internal data handling are approved.

## Post-Deploy Checklist Location

- `docs/deployment/post-deploy-verification.md`

## Known Issues

- `npm run lint` has 5 documented pre-existing hook dependency warnings outside Pipeline Defense.
- The broader repo still contains older backend/API-oriented files outside the local-first Pipeline Defense boundary.
- Vercel access protection must be confirmed before sharing any deployment URL internally.

## Next Recommended Step

- Install or access the Vercel CLI on an approved machine, run a preview deployment with `vercel`, complete the post-deploy verification checklist, then deploy production with `vercel --prod` only after access protection is confirmed.
