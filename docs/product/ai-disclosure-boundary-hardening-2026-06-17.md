# AI Disclosure And Product Boundary Hardening

Date: 2026-06-17

Roadmap slice: A8/R10 trust readiness

## Decision

Memoire now has route-level AI disclosure on the main user-facing AI-assisted capture surfaces, but this does not replace legal review.

The controlled cohort can use this as product-boundary evidence only if the operator also confirms the deployed UI and keeps early-access positioning active.

## Surface Review

Reviewed surfaces:

- `src/features/legal/LegalPage.tsx`
- `src/features/settings/BoundariesTab.tsx`
- `src/features/v31/AskMemoirePage.tsx`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/v31/QuickCapturePanel.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/services/draftAssistProvider.ts`

## Superseded 2026-08-11: there is no AI

Everything in the "Product Truth" list below was true when this was written and
none of it is true now. The AI provider, its key, its endpoints and the client
modules that called them were removed; `scripts/verify-no-ai-dependency.mjs`
fails the build if any of them come back. Capture parses on the device by rule
and Search & Insights computes from the operator's own records.

This document stays as written because it is a dated review record. It is not a
description of the product, and it must not be read as one.

What outlived it was the disclosure copy this pass introduced. The privacy
policy, the terms, the public boundaries page and the in-app Boundaries tab all
went on telling users their text might be sent to "the configured server-side
AI provider" for two months after that stopped being possible - and
`scripts/verify-trust-boundary-contract.mjs` required those exact words, so the
false claim was not merely unnoticed, it was enforced. All four were corrected
on 2026-08-11, and the same contract now requires the true statement instead.

The lesson is narrow and worth keeping: a marker contract pins whatever it was
given. When the behaviour it describes is deliberately removed, the contract is
part of what has to be removed with it, or it turns into the thing that keeps
the lie alive.

## Product Truth (as of 2026-06-17, no longer accurate - see above)

AI/provider boundaries as of this pass:

- Ask Memoire may send selected sales context to the configured Ask endpoint when a signed-in user asks a question that cannot be answered locally.
- Daily Capture AI Assist may send the full note to the configured server-side AI endpoint when the user clicks classify.
- Quick Capture quick-note structuring may send the submitted note to the configured server-side AI endpoint for signed-in users.
- Quick Capture email-thread structuring is local parsing in the current browser flow.
- Pipeline Defense Draft Assist uses the local mock provider only and does not call an AI API or network endpoint.
- Follow-up Composer generates deterministic local drafts and does not send email.

## Change Made

`src/features/v31/QuickCapturePanel.tsx` now shows a mode-aware disclosure directly below the raw note input:

- Quick Note mode: tells users that signed-in structuring may send the note to the configured server-side AI endpoint, that output must be reviewed, and that confidential customer data should only be used with an approved provider.
- Email Thread mode: tells users the current structuring flow is local parsing and still requires review before saving.

## Gate Impact

This improves:

- Gate A8: product-accurate boundaries are more visible in the app, not only in legal pages.
- Risk R10: visible AI/provider disclosure now exists near Ask Memoire, Daily Capture AI Assist, and Quick Capture structuring.

Still open:

- Legal review for the actual jurisdiction and business entity.
- Production visual QA on deployed routes.
- Operator confirmation that provider configuration and customer guidance match the deployed environment.

## Verification

Required verification after this pass:

- Run `npm run verify:trust-boundary` to confirm public legal routes, Settings boundaries, Ask Memoire, Daily Capture, Quick Capture, Pipeline Draft Assist, and this evidence document still match the A8/R10 contract.
- Typecheck/build the frontend.
- Confirm Quick Capture copy renders in both Quick Note and Email Thread modes.
- Confirm the disclosure does not imply AI use where current flow is local-only.

Static coverage:

- `docs/product/trust-boundary-contract-coverage-2026-06-17.md`
- `scripts/verify-trust-boundary-contract.mjs`
