# Phase M.61 - Early Access Request / Lead Capture Lite Report

## What Was Added

Phase M.61 adds a lightweight, no-backend early access request flow for visitors who finish the demo or read the landing page. The flow captures commercial intent signals without adding payment, CRM integration, analytics, or a backend lead database.

## Files Changed

- `src/App.tsx`
- `src/components/demo/DemoJourneyCard.tsx`
- `src/components/marketing/Footer.tsx`
- `src/components/marketing/HeroSection.tsx`
- `src/components/marketing/MarketingNav.tsx`
- `src/features/demo/DemoEntryPage.tsx`
- `src/features/earlyAccess/EarlyAccessRequestPage.tsx`
- `src/features/pricing/PricingPage.tsx`
- `src/features/validation/ValidationFeedbackPage.tsx`
- `src/pages/LandingPage.tsx`
- `src/utils/earlyAccessRequests.ts`
- `docs/briefs/phase-m61-early-access-request-lead-capture-lite-report.md`

## Request Access Fields

The request form includes:

- Name
- Work email
- Role
- Segment / industry
- Current CRM or pipeline tool
- Pipeline review frequency
- Biggest pipeline review pain
- What interested you most
- Preferred use case
- Budget owner

## No-Backend Submission Behavior

No backend submission was added. On submit:

- The request is saved locally in the browser.
- A copy-ready request summary is generated.
- The user can copy the summary.
- The user can open a prefilled email to request access.

The UI explicitly says the request is not sent to a server automatically.

## LocalStorage Key

Early access requests are stored locally under:

`memoire.earlyAccessRequests.v1`

## CTA Routing

Request Access CTAs now route to:

`/request-access`

Updated surfaces include:

- Landing page hero
- Landing final CTA
- Landing pricing hypothesis section
- Marketing nav
- Marketing hero component
- Footer
- `/demo`
- Demo completion panel
- `/pricing`

## Privacy Copy

The request page tells visitors not to include confidential customer data. It frames the request as product access and use-case context only.

## Validation Log

`/app/validation-feedback` now includes a local Early Access Requests section so Henry can view and copy request summaries saved in this browser.

## Manual QA Checklist

- Open `/`.
- Click Request Access.
- Verify `/request-access` renders.
- Fill request form.
- Submit.
- Verify summary renders.
- Click Copy Request Summary.
- Click Email Request.
- Return to `/demo`.
- Complete demo path and click Request access from completion panel.
- Verify `/request-access` works.
- Test mobile layout for request page.
- Verify no backend/network dependency is required.
- Verify existing `/demo` still works.
- Verify `/app/pipeline-defense` still works.
- Run `npm run build`.
- Run `npm run lint`.

## Known Limitations

- Requests are local-only unless the user copies or emails the summary.
- There is no backend lead database yet.
- There is no analytics funnel tracking.
- The email request opens the user's mail client and depends on local device configuration.

## Supabase SQL

No Supabase SQL changes are required for M.61.

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings.
