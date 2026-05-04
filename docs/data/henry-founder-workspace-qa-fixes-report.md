# Henry Founder Workspace QA Fixes Report

Date: 2026-05-04

Scope: Phase 02.2 Founder Workspace QA fixes only. No new product features, data model changes, Supabase migration, review flag UI, pricing UI, hard due-date conversion, or CRM dashboard behavior were added.

## 1. Files Changed

- `.env.example`
- `src/lib/demoMode.ts`
- `src/features/v31/AskMemoirePage.tsx`
- `src/features/v31/OpportunitiesPage.tsx`
- `src/features/v31/AccountMemoryPage.tsx`
- `src/features/v31/data/henryFounderWorkspaceSeed.ts`
- `docs/data/henry-founder-workspace-qa-report.md`
- `docs/data/henry-founder-workspace-manual-test-guide.md`
- `docs/data/henry-founder-workspace-qa-fixes-report.md`

## 2. Founder Flag Implementation

Implemented explicit local founder workspace flag:

```env
VITE_ENABLE_FOUNDER_WORKSPACE=true
```

Behavior:

- `Load Henry Workspace` can appear when `VITE_ENABLE_FOUNDER_WORKSPACE=true`.
- Supabase env no longer needs to be blank for founder workspace QA.
- The workspace still does not auto-load.
- Henry must still click `Load Henry Workspace` intentionally.
- The app remains in local founder/demo memory mode when this flag is enabled.

`.env.example` now documents:

```env
VITE_ENABLE_FOUNDER_WORKSPACE=false
```

## 3. Ask Memoire All Memory Attention Routing Changes

All Memory attention-style prompts now route through deterministic local memory signals before generic fallback / API behavior.

Covered prompt intents:

- `what needs attention`
- `which accounts need attention`
- `what should I focus on`
- `which deals are broken`
- `which accounts are broken`
- `show broken loops`
- `what are my broken loops`

The answer now returns ranked attention items from:

- Broken Loops
- Memory Health
- Open actions / overdue actions through existing Broken Loop detection
- Missing next action through existing Broken Loop / Memory Health logic

Each item includes:

- Account or opportunity name
- Reason
- Signal source
- Suggested next action

Empty state:

`No major attention items detected. Your sales memory loop looks healthy.`

Verified prompt:

`Which accounts need attention?`

Result:

- Returned deterministic ranked items such as Samil opportunity with no next action, overdue action, Terumo blocker, TV Pharm blocker, and Memory Health issues.
- Did not mix unrelated objections into one generic account summary.

## 4. Clean State Guidance Added

Created:

`docs/data/henry-founder-workspace-manual-test-guide.md`

Guidance says:

1. Use a clean browser profile/incognito session, OR
2. Manually clear Memoire local demo storage before loading Henry Workspace.
3. Reload the app.
4. Click `Load Henry Workspace`.

No reset button was added.

No localStorage auto-clear was added.

The QA report now points to this guide.

## 5. Tentative Timing Wording Changes

Pipeline Open timing copy was changed from:

`Review EM / PMM RTU timing (04Apr/W2)`

to:

`Review tentative timing: EM / PMM RTU (04Apr/W2)`

Rules preserved:

- `dueDate` remains `null`.
- `04Apr/W2` is not converted into a calendar due date.
- `rawOpenTiming`, `tentativeTiming`, and `timingLabel` metadata remain preserved.

Verified:

- Opportunity Memory shows tentative timing wording.
- Related actions still show no hard due date.

## 6. Confidence Visibility Changes

Primary Founder Workspace UI no longer shows pipeline probability-derived `Confidence`.

Changed:

- Removed `Confidence` fact from Opportunity Memory cards.
- Removed `Confidence` from Account Memory decision context.

Preserved:

- `sourceProbability`
- `rawProbability`
- `confidenceHint`

These remain metadata only.

No `win probability`, `deal score`, or `forecast score` UI was added.

## 7. Build / Lint Result

Result: Pass

Targeted lint passed for changed implementation files.

Production build passed:

- `npm run build`

Existing Vite chunk-size warning remains:

- Some chunks are larger than 500 kB after minification.

This warning is pre-existing product/build shape and not caused by these QA fixes.

## 8. Remaining Issues

1. Existing local demo data can still appear if Henry tests in a browser profile with previous Memoire demo records.
   - This is intentional because the founder seed must not overwrite unrelated demo data.
   - Manual clean-state guidance now exists.

2. TV Pharm still has duplicate source-backed tender/procurement blockers.
   - This was explicitly not fixed in this phase.

3. Founder workspace mode is local/development oriented.
   - It is not a Supabase import or real synced founder workspace.

4. All Memory attention routing is deterministic but still limited by available local memory relationships.
   - It does not invent missing contacts, decision makers, or decision timelines.

## 9. What Needs Product Review

1. Confirm whether enabling `VITE_ENABLE_FOUNDER_WORKSPACE=true` should intentionally force local founder/demo memory mode even when Supabase env exists.
2. Confirm whether visible commercial value should remain on Opportunity Memory during validation.
3. Confirm whether TV Pharm duplicate tender blockers should be deduplicated after manual test.
4. Confirm whether founder workspace should later be imported into Henry's real Supabase user after validation.
