# Internal MVP Known Warnings

Current status: no active lint warnings were observed during the 2026-07-01 polish pass.

## Cleanup Notes

- Legacy deal pages were removed because `/app/deals/*` now redirects to `/app/opportunities`.
- The unused legacy dashboard page was removed because `/app/dashboard` now redirects to `/app/today`.
- The unused `useDeals`, `useDashboard`, `Deal`, and legacy dashboard type files were removed with the legacy pages they supported.

## Verification

Latest local checks for this cleanup:

- `npm run verify:ui-text-polish`
- `npm run lint`
- `npm run build`

All three passed after the cleanup.

