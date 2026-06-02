# Phase M.59 - Commercial Demo Polish / Public Demo Mode Report

## What Was Added

Phase M.59 improves the public demo path so a new visitor can move from landing page to a focused local-only demo, then reach the Pipeline Defense Brief aha moment in a few minutes.

## Files Changed

- `src/features/demo/DemoEntryPage.tsx`
- `src/features/demo/DemoGuidePage.tsx`
- `src/components/layout/AppShell.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/utils/sampleData.ts`
- `src/utils/demoJourney.ts`
- `src/components/demo/DemoModeBanner.tsx`
- `src/components/demo/DemoJourneyCard.tsx`
- `docs/briefs/phase-m59-commercial-demo-polish-public-demo-mode-report.md`

## Demo Route / Entry Behavior

The `/demo` route is now a focused public demo entry page instead of immediately loading sample data and redirecting.

It explains:

- Try Memoire with sample pipeline data
- No CRM connection required
- Demo data stays local in the browser
- Demo can be reset anytime
- The core aha moment is Pipeline Defense Brief and Manager Summary

Primary CTA:

- Start Demo

Secondary CTAs:

- View Demo Guide
- Back to Landing

When Start Demo is clicked, a confirmation modal explains that demo data:

- is sample data
- stays local in the browser
- is not synced to the user's cloud account
- does not write back to CRM

After confirmation, the existing demo sandbox sample dataset is loaded and the user is routed to `/app/dashboard?demo=1`.

## Landing CTA Changes

M.58 already routed Try Demo to `/demo`. M.59 preserves this behavior and makes `/demo` the focused public entry point.

Current key CTAs:

- Try Demo: `/demo`
- Open App: `/app/dashboard`
- Pipeline Review Flow: `/app/onboarding/pipeline-review`
- Request Access: `mailto:hello@memoire.app?subject=Memoire early access`

## Demo Mode Banner Behavior

A persistent demo banner appears inside the app shell when demo sample data is active:

> Demo mode active - sample data is stored locally in this browser and is not synced to your account.

Actions:

- Continue demo
- Reset demo
- Exit demo

Reset and exit both ask for confirmation. They clear only sample/demo records using existing sample record markers and do not delete cloud data.

## Demo Journey Behavior

Added a reusable `DemoJourneyCard` shown in:

- Demo Guide
- Dashboard when demo sandbox is active
- Pipeline Defense when demo sandbox is active

Steps:

1. Review Dashboard signals
2. Open weak opportunity
3. Capture a quick update
4. Generate Pipeline Defense Brief
5. Copy Manager Summary
6. Save Review Pack

The card keeps the demo path focused and reduces navigation drift.

## Demo Completion Behavior

Added local-only demo journey completion state:

- key: `memoire.demoJourney.completed`

The journey is marked complete when a demo user:

- copies Manager Summary
- copies share-ready Pipeline Defense Markdown
- saves a Review Pack
- updates a saved Review Pack
- copies a saved Review Pack manager summary

When complete, the journey card shows:

> You've seen the core Memoire workflow: turn pipeline data into a manager-ready review brief.

CTAs:

- Start your first pipeline review
- Request access

## Reset Demo Behavior

Reset demo data uses the existing sample sandbox cleanup:

- removes records marked `isSample`
- removes records with `source: "demo"`
- removes demo-prefixed records
- clears `memoire.sampleData.loaded`
- clears `memoire.demoJourney.completed`

It does not delete cloud data.

## Known Limitations

- Demo progress is local-only and intentionally lightweight.
- The demo journey does not hide full app navigation.
- Reset behavior relies on sample/demo markers; if a user manually edits demo records and removes markers, those records may no longer be detected as demo records.
- No analytics SDK was added.
- No public share or collaboration infrastructure was added.

## Supabase SQL

No Supabase SQL is required for M.59.

## Manual QA Checklist

- Open `/`
- Click Try Demo
- Verify focused demo entry renders
- Click Start Demo
- Verify local-only confirmation appears
- Confirm demo load
- Verify user lands on Dashboard with demo data
- Verify demo mode banner appears
- Verify Demo Journey appears on Dashboard
- Open `/app/demo-guide`
- Verify Demo Journey appears
- Follow demo journey to Opportunities
- Follow demo journey to Pipeline Defense
- Enter Review Mode
- Copy Manager Summary
- Verify Demo Complete state appears
- Save Review Pack
- Reset demo data
- Verify demo records are removed and cloud data is not changed
- Verify Open App CTA still works
- Verify `/app/demo-guide` still works
- Verify `/app/dashboard` still works
- Run `npm run build`
- Run `npm run lint`

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing React hook dependency warnings in legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
