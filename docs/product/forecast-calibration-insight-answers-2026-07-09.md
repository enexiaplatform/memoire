# Forecast Calibration + Measured-History Ask Answers

Date: 2026-07-09
Strategy source: `docs/product/commercial-readiness-audit-2026-07-04.md` (differentiator 2: evidence-based forecast defense), follows `silence-roi-learning-loop-2026-07-09.md`.

## Problem

Every closed outcome snapshots the pre-outcome forecast-evidence label, but nothing ever computed what those labels are worth: a seller could call deals "Defensible" for a year and never learn they win only 40% of them. Separately, Ask Memoire routed deterministic questions about the seller's own history ("did my follow-ups work?") to the generic answer path, where the AI endpoint could only approximate numbers Memoire already knows exactly.

## Changes

### 1. Personal forecast calibration

- `src/utils/forecastCalibration.ts`: per forecast-evidence label - closed / won / lost / stalled counts and the seller's own win rate, computed from deduplicated outcomes (latest outcome per opportunity wins). Rates below `FORECAST_CALIBRATION_MIN_SAMPLE` (3) closed outcomes stay explicitly unrated and are never applied.
- Miscalibration warnings: inversions (a weaker label out-performing a stronger one) and a below-50% "Defensible" callout. The headline leads with the strongest warning, or affirms healthy calibration.
- Calibrated expected value: active pipeline per label x the seller's own win rate, with unrated-category deals counted and excluded transparently.
- `ForecastCalibrationPanel` on the Pipeline Defense page (hidden until at least one closed outcome exists) with the explicit basis line "your history, not a prediction".
- Contract: `scripts/verify-forecast-calibration-contract.mjs` (`npm run verify:forecast-calibration`).

### 2. Ask Memoire answers from measured history

- `src/features/v31/askMemoireInsightAnswers.ts`: narrow deterministic detection routes three question families to computed data layers instead of the AI endpoint - "did my follow-ups work / what did I revive" (follow-up impact), "what worked against X objections" (objection playbook), "how accurate is my forecast / what is my win rate" (calibration). Ambiguous questions fall through to the normal path; "which objections are unresolved" explicitly does not match (word-boundary guard - that is the attention path's question).
- Answers carry a new `insight` card kind with real numbers, honest empty states, and the status line "Answered from your measured history (no AI involved)."
- Morning Brief adds "Did my follow-ups work?" as a suggested question when follow-ups are waiting on a reply.
- Contract: `scripts/verify-ask-insight-answers-contract.mjs` (`npm run verify:ask-insight-answers`). The contract caught two real detection bugs pre-ship (one-directional forecast regex; "unresolved" substring-matching "resolve").

### 3. Demo outcome history

Sample data gains four closed outcomes (Defensible: 2 won + 1 lost = 67% win rate; Hope-based: 1 lost, unrated) wired through new `opportunityOutcomes` plumbing in `sampleData.ts` (storage key, dataset type, load/clear). The public demo now demonstrates calibration out of the box: the panel on Pipeline Defense and the Ask answer both show "Defensible win rate 67%" with a 1.6B VND calibrated pipeline value.

## Verification

- `npm run check` green (build, typecheck, lint, full contract suite including the two new contracts).
- Runtime smoke (dev server + Chromium, fresh demo sandbox): "Did my follow-ups work?" -> Saved from silence card; "What worked against price objections?" -> objection insight card; "How accurate is my forecast?" -> calibration card with 67% Defensible win rate and calibrated pipeline value; Pipeline Defense shows the calibration panel. All three carry the "no AI involved" status.

## Follow-ups

- Calibration could later inform the Pipeline Defense readiness score (e.g. discount "Defensible" claims when the seller's own history contradicts them) - decide after cohort evidence.
- Insight-question detection is intentionally narrow; widen only from observed real questions, not speculation.
