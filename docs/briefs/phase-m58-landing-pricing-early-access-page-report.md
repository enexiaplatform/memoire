# Phase M.58 - Landing + Pricing / Early Access Page Report

## What Was Added

Phase M.58 packages Memoire as a public-facing early access product surface. The landing page now explains Memoire as a personal B2B sales memory and pipeline review OS, not a CRM replacement.

The public route is:

- `/`

## Files Changed

- `src/pages/LandingPage.tsx`
- `src/components/marketing/MarketingNav.tsx`
- `docs/briefs/phase-m58-landing-pricing-early-access-page-report.md`

## Landing Route

The existing public `/` route was reused and upgraded. No new route guard behavior was introduced.

The page includes:

- Hero section with product positioning
- Product preview for a weekly Pipeline Defense Review Pack
- "Not a CRM" section
- Core 5-step workflow
- Feature/value cards
- Target user and "not ideal yet" audience sections
- Early pricing hypothesis
- Privacy FAQ
- Early access CTA

## Positioning Copy

Core positioning:

- Your CRM tracks records for the company.
- Memoire helps the individual salesperson think, remember, and prepare.
- Memoire uses CSV imports as read-only working copies.
- Memoire helps detect weak pipeline, missing proof, objections, stakeholder gaps, and MEDDIC-lite risks.
- Memoire helps generate manager-ready Pipeline Defense Briefs and save weekly Review Packs.

## Pricing Hypothesis

No payment checkout was added.

The landing page shows early pricing hypotheses:

- Solo: `$15-25/month`
- Pro: `$29-49/month`
- Team later: not available yet

The section is labeled clearly as:

- "Early pricing hypothesis - not final"

## CTA Behavior

Primary and secondary CTAs route to existing flows:

- Try the Demo: `/demo`
- Open App: `/app/dashboard`
- Start Pipeline Review Flow: `/app/onboarding/pipeline-review`
- Request Access: `mailto:hello@memoire.app?subject=Memoire early access`

No lead capture backend was added.

## FAQ / Privacy Messaging

The FAQ covers:

- Whether Memoire is a CRM
- Whether Memoire writes back to CRM
- Where data is stored
- CSV exports from Salesforce, HubSpot, or Excel
- Optional AI assist and external data handling
- Target users
- Pipeline Defense Brief definition

The copy avoids overpromising security and reflects the current product reality:

- local-first where applicable
- account sync where configured
- demo sandbox stays local
- CSV import is a browser working copy
- no CRM writeback
- optional AI assist through configured server-side endpoint

## Known Limitations

- No payment checkout.
- No backend lead capture form.
- No Salesforce or HubSpot native sync.
- No team workspace, manager dashboard, SSO, or admin controls.
- Pricing is a discovery hypothesis, not final packaging.

## Supabase SQL

No Supabase SQL is required for M.58.

## Manual QA Checklist

- Open `/`
- Verify hero and CTAs render
- Click Try Demo
- Click Open App
- Click Request Access
- Verify Not a CRM section
- Verify workflow section
- Verify feature cards
- Verify target user section
- Verify pricing hypothesis section
- Verify FAQ renders
- Verify mobile/responsive layout
- Verify `/app/dashboard` still works
- Verify `/app/demo-guide` still works
- Verify `/app/pipeline-defense` still works
- Run `npm run build`
- Run `npm run lint`

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing React hook dependency warnings in legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
