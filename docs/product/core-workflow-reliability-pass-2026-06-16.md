# Memoire Core Workflow Reliability Pass

Date: 2026-06-16

Roadmap session: Session 8 - Core Workflow Reliability Pass

## Decision

The most important reliability gap found in this session was not the brief generation path itself. It was the return path for the saved Review Pack, which is the core activation artifact for early-access users.

Memoire already had cloud-aware storage for review packs, but several user-facing surfaces still loaded review packs from browser storage only. That could make a signed-in cohort user believe a Review Pack was missing after returning later, switching devices, or relying on cloud sync.

This session hardens the path:

Import or add pipeline -> create Pipeline Defense Brief -> save Review Pack -> return later and find the Review Pack.

## What Changed

### Cloud-Aware Review Pack Loader

Added `loadReviewPacksForWorkspace(userId, sampleDataActive)` in `src/utils/reviewPacks.ts`.

Behavior:

- Demo workspace: load local demo/browser Review Packs only.
- Signed-in non-demo workspace: load and merge cloud Review Packs with safe local fallback.
- Browser-only workspace: load local Review Packs.
- Cloud error: preserve browser-local fallback instead of blocking the workflow.

### Dashboard Return Path

Updated `src/features/dashboard/DashboardPage.tsx` so the dashboard loads Review Packs through the workspace-aware loader.

This makes the weekly review card and dashboard review-pack signals reflect synced Review Packs for signed-in users.

### Pipeline Defense Return Path

Updated `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx` so saved Review Packs are refreshed from the workspace-aware loader when auth/demo state is known.

This helps the Review Pack History area show synced packs after returning to Pipeline Defense.

### Direct Review Pack Route

Updated `src/features/pipeline/PipelineReviewPackPage.tsx` so direct Review Pack routes check browser storage and cloud workspace sync before showing "not found."

This reduces false-negative "missing pack" states for signed-in users.

### Demo Review Pack Cloud Contamination Guard

Updated Review Pack creation and persistence so demo Review Packs are explicitly marked as demo/sample artifacts and do not sync into a signed-in cloud workspace.

Behavior:

- Demo-created Review Packs carry `source: demo` and `isSample: true`.
- Demo save, update, and delete actions stay local to the browser instead of calling the cloud JSON store.
- Signed-in workspace loading filters out demo/sample Review Packs before claiming local browser records into the user's cloud workspace.
- User-created Review Packs still use normal cloud sync.

This reduces the chance that a cohort user signs in after trying the demo and finds sample Review Packs mixed into real account data.

## Verification

Automated verification:

- `npm run build` passed.

Local browser verification:

- `/app/pipeline-defense` rendered successfully in demo workspace mode.
- Pipeline Defense page showed the Review Pack surface.
- `/app/pipeline-defense/review-pack/nonexistent-pack-for-smoke-test` rendered a clean not-found state.
- No visible runtime error was detected in either route.

Static verification:

- Confirmed dashboard, Pipeline Defense, and direct Review Pack page now use the workspace-aware loader.
- Confirmed the helper falls back to local Review Packs on sync failure.
- Confirmed demo Review Packs are marked as sample artifacts, demo save/update/delete calls disable cloud sync, and signed-in cloud merge filters demo/sample packs.

Verification limit:

- Browser evaluation could not directly inspect `localStorage` in the in-app browser sandbox during this pass, so the demo marker was verified statically plus by TypeScript build, not by runtime storage inspection.

## Remaining Reliability Risks

- This was not a real signed-in cloud QA run. Session 4 two-account QA remains required.
- The full cohort workflow still needs a real browser test with a signed-in user: create/import opportunity, generate brief, save pack, reload, logout/login, confirm pack remains available.
- Demo-to-account QA still needs a signed-in browser run that creates a demo Review Pack, signs in, and confirms no demo pack appears in Supabase-backed workspace data.
- Pipeline Defense brief storage and Review Pack storage are still separate systems. The UX is acceptable for cohort, but it should be watched for confusion.
- Deletion uses cloud tombstones through the shared cloud JSON store, but operational verification is still pending.

## Next Recommended Step

Do not jump straight to pricing until cohort evidence exists.

The next best commercial action is one of:

1. Run Session 3/4 operational gates so the cohort can actually be invited.
2. If staying in code, continue Session 8 reliability with signed-in workflow QA and fixes.
3. If enough cohort evidence exists later, proceed to Session 9 pricing and packaging.
