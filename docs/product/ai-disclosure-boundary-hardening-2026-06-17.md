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

## Product Truth

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
