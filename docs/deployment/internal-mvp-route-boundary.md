# Internal MVP Route Boundary

## Primary Internal MVP Route

- `/app/pipeline-defense`

This is the primary route for the local-first Pipeline Defense MVP. It stores multiple weekly briefs in browser `localStorage` and does not add a Pipeline Defense backend, database, auth flow, real AI provider, or network integration.

## Routes Visible In Sidebar

The current app sidebar links to:

- `/app/today`
- `/app/journey`
- `/app/accounts`
- `/app/opportunities`
- `/app/pipeline-defense`
- `/app/ask`
- `/app/settings`

The sidebar also includes a secondary settings link to `/app/settings`.

## Public Routes Still Present

These public routes are defined in `src/App.tsx`:

- `/`
- `/login`
- `/signup`
- `/verify-email`
- `/pricing`
- `/demo`

## App Routes Still Present

These protected app routes are defined in `src/App.tsx`:

- `/app/today`
- `/app/journey`
- `/app/accounts`
- `/app/accounts/:accountId`
- `/app/opportunities`
- `/app/pipeline-defense`
- `/app/ask`
- `/app/settings`

## Legacy Routes Still Present

These legacy V0 routes still exist as redirects:

- `/app/dashboard` -> `/app/today`
- `/app/capture` -> `/app/today`
- `/app/history` -> `/app/today`
- `/app/entities` -> `/app/accounts`
- `/app/entities/:entityId` -> `/app/accounts`
- `/app/deals` -> `/app/opportunities`
- `/app/deals/new` -> `/app/opportunities`
- `/app/deals/:id` -> `/app/opportunities`
- `/app/deals/:id/edit` -> `/app/opportunities`
- `/app/search` -> `/app/ask`

These redirects are safer than exposing the old pages directly, but they still make the broader app surface visible.

## Routes Not Linked But Technically Reachable

- Dynamic account route: `/app/accounts/:accountId`
- Public auth/pricing/demo routes
- Legacy redirect routes listed above
- Catch-all route redirects unknown paths to `/`

## Safety Assessment

The Pipeline Defense MVP itself remains local-first. However, the deployed project is still the broader Memoire app, not a dedicated Pipeline Defense-only app. Some non-Pipeline routes depend on older app code and Supabase-oriented flows.

For internal deployment, this is acceptable only if the deployment is treated as an internal/private app and protected at the Vercel project/deployment level.

## Deployment Recommendation

- Deploy the whole app as internal/private only for now.
- Use Vercel project protection, preview protection, password protection, SSO, or equivalent workspace controls before sharing.
- If the deployment should expose only Pipeline Defense, hide non-Pipeline sidebar entries in a later hardening phase.
- If Pipeline Defense becomes the sole internal MVP, consider splitting it into its own smaller Vite app or route-isolated package later.
