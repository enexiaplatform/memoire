# Internal MVP Vercel Deploy Notes

## Deployment Target

- Target: Vercel
- App type: Vite SPA, local-first Pipeline Defense MVP
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: `dist`
- Root directory: current repo root
- Framework preset: Vite
- Route to test after deploy: `/app/pipeline-defense`

## Current Project Link

The local repo contains `.vercel/project.json` for the Vercel project named `memoire`.

## Manual Deployment Steps

Use these steps when deploying from a machine with the Vercel CLI installed and access to the target Vercel team/project:

```bash
npm install
npm run build
vercel login
vercel
```

For production deployment after the preview has been verified:

```bash
vercel --prod
```

If Vercel prompts for project settings, use:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Root directory: current repo root

Do not deploy production publicly until access protection/private deployment settings are confirmed.

## Routing

The project includes `vercel.json` with a SPA fallback rewrite to `index.html`, so direct refreshes on routes such as `/app/pipeline-defense` should resolve to the React app.

## Local-First Data

Pipeline Defense briefs are stored in browser `localStorage` under:

- Active multi-brief store: `memoire.pipelineDefenseBriefs.v1`
- Legacy single-brief migration key: `memoire.pipelineDefenseBrief.v1`

This means each browser/device has its own local data. Clearing browser data may remove saved briefs.

## Internal Use Warning

The Pipeline Defense MVP has no dedicated backend, database, authentication gate, CRM sync, Gmail sync, real AI provider, or server-side persistence for this feature. Treat this as an internal/private web app until those controls are intentionally added.

Do not enter confidential customer information into the internal MVP unless the deployment access controls and data-handling policy are approved.

## Recommended Access Control

For internal use, keep the Vercel project protected. Use Vercel project protection, private deployment controls, preview protection, password protection, SSO, or the strongest available workspace-level access controls before sharing the URL.

## Post-Deploy Smoke Test

1. Open the deployed app.
2. Navigate to `/app/pipeline-defense`.
3. Refresh the direct route and confirm the page still loads.
4. Confirm the Internal MVP warning banner is visible.
5. Create or select a brief.
6. Edit metadata and deal fields.
7. Refresh and confirm local persistence in the same browser.
8. Import deals and confirm append/replace still works.
9. Analyze deal risks.
10. Check review readiness.
11. Generate this week's actions.
12. Enter and exit Review Mode.
13. Export Brief.
14. Print / Save PDF and confirm app controls/warnings are hidden from print.
15. Confirm no Pipeline Defense backend, auth, real AI, API key, or network integration was added for this deployment prep phase.
