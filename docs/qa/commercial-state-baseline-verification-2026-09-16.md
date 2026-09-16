# Commercial State Engine — M0 verification evidence

Date: 2026-09-16. Scope: architecture audit, documentation and five preservation tests only.

**M0.1 follow-up:** the seven lint errors below are historical and are corrected by the checkpoint introducing [baseline stabilization and current Leads audit](commercial-baseline-stabilization-2026-09-16.md). That report identifies the single checkpoint and current acceptance blockers. Preserve the original M0 results below as revision-specific evidence; do not reuse them as verification of M0.1. A green existing suite does not resolve the two reproduced Lead persistence/isolation defects.

See the [architecture evolution ADR](../product/commercial-state-engine-evolution-2026-09-16.md). M0 changes no production code, navigation, database schema or ranking behavior.

## Revisions and method

The audit baseline is `c085313fa5ad1b06ac411096a1827a5591f14d13`. The shared checkout already had unrelated changes when inspection began, including Leads, navigation, Opportunity storage, nudges and date handling. Other work committed further changes during inspection. A run against that moving checkout is not evidence about the initial commit.

For reproducibility, each fixed revision was extracted with `git archive` into a separate temporary directory. Each used a directory junction to the existing installed `node_modules`; no environment file was copied. A local Git index containing `src` was initialized because a verifier calls `git ls-files src`. No remote or deployed database was changed. The original baseline archive first failed that verifier solely because archive extraction omits `.git`; after supplying the required index, the same source passed. This is a harness correction, not a waived source failure.

The runner executed every one of the 115 commands from `package.json`'s `check` chain separately, in order, to collect all failures rather than stopping at the first. Commands are `npm run <name>` in the matrix below. `build` runs TypeScript build checking, Vite and nine prerendered pages. API type checking is separate. An additional `npx tsc -b --pretty false` passed on the baseline.

Local raw logs and result manifests are under `C:\Users\PC\AppData\Local\Temp\memoire-m0-20260916` (`baseline-results`, `checkpoint-results`, and the initial moving-checkout results). These are temporary diagnostic artifacts; the durable results are recorded here.

## Results

| Target | Result |
|---|---|
| Fixed baseline, existing suite | All 115 commands pass after correcting the Git-index harness; 1,474 unit tests pass. Lint has zero errors and two existing hook-dependency warnings. |
| Fixed baseline plus five M0 tests | `npm run test`: 1,479 pass, 312 suites, zero failures/skips/todos. |
| Fixed newer checkpoint `0b3a3c5f9abc31a19aa6059668ee77df0c1aad98` plus M0 tests | 114/115 commands pass. `npm run test`: 1,556 pass, 332 suites, zero failures/skips/todos. Lint fails with seven errors and two warnings. |

At the newer checkpoint, `src/services/opportunityStore.ts:359` binds `id`, `userId`, `createdAt`, `updatedAt`, `storageMode`, `source`, and `isSample` without using them; each violates `@typescript-eslint/no-unused-vars`. These bindings are present in the archived commit, independently of the new M0 test file. M0 made no change to this file. The two warnings are unnecessary `useMemo` dependencies in `FirstRunPage.tsx:68` and `SettingsPage.tsx:83`. Correct the seven errors and verify the resulting fixed revision before accepting M1.

The first, non-reproducible moving-checkout run failed navigation, commercial-evidence, commercial-learning and commercial-linkage contracts because Leads increased primary destinations from six to seven before corresponding contracts were updated. It also had eight lint errors: the seven bindings above plus a fast-refresh export error in `LeadActionDrawers.tsx`. These failures existed before M0's files were added. At fixed checkpoint `0b3a3c5`, all four contracts and the fast-refresh issue pass; the seven bindings remain. No contracts were weakened by M0.

## Preservation tests added

`test/unit/commercialKernelRoundTrip.test.mjs` has four full-fixture tests for events, evidence, commitments and threads. Each traverses the actual row codec, JSON serialization, backup parsing, local restore planning and sanitizer, then compares to the original fixture. This protects source provenance, links, dates and existing historical fields against silent loss. The fifth test preserves distinct observed/recorded dates for late-entered evidence and removes sample evidence from restoration.

These tests do not assert a full cloud restore, atomic writes, deployed RLS, or future Condition/Dependency behavior. No speculative types or product changes were added.

## Reproduced architecture gaps

Using the baseline source, `opportunityToFormInput` on a record containing `closedOn` returns an object for which `Object.hasOwn(form, 'closedOn')` is false. The update codec can subsequently write null. Existing reader field-coverage checks do not cover this helper. This is a baseline finding; later Opportunity changes must be reviewed separately.

Using `buildRestorePlan` on an export containing `cloudData.data.commercial_evidence` but no local browser records produces zero local writes. Cloud exports and local restore coverage are therefore not equivalent. The ADR records the omitted explicit cloud restore paths. The added round-trip tests deliberately exercise local backup records and do not hide this gap.

## Performance and limits

Baseline `verify:performance-budget` passed: thread resolution 7.2 ms / 600 ms budget; Delta 0.2 / 100; ranking 2.0 / 150; Capture 4.3 / 120; evidence fold 0.2 / 40; learning 5.6 / 400; historical linkage 1.4 / 300. Fixtures include 300 opportunities, 900 activities, 200 accounts and 250 quotes; learning includes 1,000 closed opportunities, 5,000 activities and 1,000 findings. Measurements are local observations, not service guarantees.

Baseline scale checks passed when growing 100 to 200 opportunities: pipeline 16.7 to 35.9 ms (2.2x), activity ledger 7.8 to 14.4 ms (1.9x), below the 3x ceiling; remaining measured surfaces passed. Neither suite proves future dependency graph performance.

Verification includes static contracts and local runtime tests, not a browser walkthrough, production data inspection, deployed migration/RLS verification or a cloud recovery drill. No learning sample-size claim is made about real users. The newer checkpoint received a full verification run, not a second full semantic architecture audit.

## Full command matrix

Baseline results below include the successful Git-index rerun. Unit-test counts including M0 are reported above.

| Command | Baseline | Newer checkpoint |
|---|---|---|
| `npm run build` | PASS | PASS |
| `npm run verify:seo` | PASS | PASS |
| `npm run verify:navigation` | PASS | PASS |
| `npm run verify:storage-safety` | PASS | PASS |
| `npm run verify:performance-budget` | PASS | PASS |
| `npm run verify:surface-scale` | PASS | PASS |
| `npm run verify:digest-delivery` | PASS | PASS |
| `npm run verify:commercial-kernel` | PASS | PASS |
| `npm run verify:kernel-surface` | PASS | PASS |
| `npm run verify:delta-intelligence` | PASS | PASS |
| `npm run verify:recommendation-ranking` | PASS | PASS |
| `npm run verify:capture-facts` | PASS | PASS |
| `npm run verify:commercial-evidence` | PASS | PASS |
| `npm run verify:commercial-learning` | PASS | PASS |
| `npm run verify:commercial-linkage` | PASS | PASS |
| `npm run verify:product-analytics` | PASS | PASS |
| `npm run typecheck:api` | PASS | PASS |
| `npm run lint` | PASS | FAIL |
| `npm run test` | PASS | PASS |
| `npm run verify:ui-text-polish` | PASS after harness correction | PASS |
| `npm run verify:first-week-path` | PASS | PASS |
| `npm run verify:first-run` | PASS | PASS |
| `npm run verify:cohort-qualification` | PASS | PASS |
| `npm run verify:cohort-stop-go` | PASS | PASS |
| `npm run verify:route-health` | PASS | PASS |
| `npm run verify:sample-live-separation` | PASS | PASS |
| `npm run verify:currency-locale` | PASS | PASS |
| `npm run verify:one-metrics-engine` | PASS | PASS |
| `npm run verify:canonical-account` | PASS | PASS |
| `npm run verify:recommendation-dedupe` | PASS | PASS |
| `npm run verify:deal-drawer-altitude` | PASS | PASS |
| `npm run verify:review-action-cap` | PASS | PASS |
| `npm run verify:weekly-commitment` | PASS | PASS |
| `npm run verify:workspace-restore` | PASS | PASS |
| `npm run verify:installable-mobile` | PASS | PASS |
| `npm run verify:account-merge` | PASS | PASS |
| `npm run verify:weekly-plan` | PASS | PASS |
| `npm run verify:activity-channel` | PASS | PASS |
| `npm run verify:qualification` | PASS | PASS |
| `npm run verify:no-invented-identities` | PASS | PASS |
| `npm run verify:record-field-coverage` | PASS | PASS |
| `npm run verify:activity-ledger` | PASS | PASS |
| `npm run verify:pipeline-ordering` | PASS | PASS |
| `npm run verify:operator-insight` | PASS | PASS |
| `npm run verify:account-link` | PASS | PASS |
| `npm run verify:money-model` | PASS | PASS |
| `npm run verify:quote-deal-link` | PASS | PASS |
| `npm run verify:opportunity-outcome` | PASS | PASS |
| `npm run verify:money-out` | PASS | PASS |
| `npm run verify:order-to-cash` | PASS | PASS |
| `npm run verify:order-margin` | PASS | PASS |
| `npm run verify:brand-and-supply` | PASS | PASS |
| `npm run verify:business-vault-knowledge` | PASS | PASS |
| `npm run verify:post-won-customers` | PASS | PASS |
| `npm run verify:own-obligations` | PASS | PASS |
| `npm run verify:daily-digest` | PASS | PASS |
| `npm run verify:safe-date` | PASS | PASS |
| `npm run verify:regex-flags` | PASS | PASS |
| `npm run verify:ai-capture` | PASS | PASS |
| `npm run verify:capture-memory` | PASS | PASS |
| `npm run verify:pipeline-defense-center` | PASS | PASS |
| `npm run verify:today-command-center` | PASS | PASS |
| `npm run verify:account-hygiene` | PASS | PASS |
| `npm run verify:account-import` | PASS | PASS |
| `npm run verify:offline-capture` | PASS | PASS |
| `npm run verify:empty-states` | PASS | PASS |
| `npm run verify:win-loss-learning` | PASS | PASS |
| `npm run verify:proactive-nudges` | PASS | PASS |
| `npm run verify:follow-up-impact` | PASS | PASS |
| `npm run verify:morning-brief` | PASS | PASS |
| `npm run verify:objection-playbook` | PASS | PASS |
| `npm run verify:forecast-calibration` | PASS | PASS |
| `npm run verify:ask-insight-answers` | PASS | PASS |
| `npm run verify:business-activity-os` | PASS | PASS |
| `npm run verify:business-os-deep-loop` | PASS | PASS |
| `npm run verify:evidence-instrumentation` | PASS | PASS |
| `npm run verify:quote-state-suggestions` | PASS | PASS |
| `npm run verify:initiative-experiment` | PASS | PASS |
| `npm run verify:commercial-journey` | PASS | PASS |
| `npm run verify:commercial-learning-brief` | PASS | PASS |
| `npm run verify:revenue-risk-brief` | PASS | PASS |
| `npm run verify:follow-up-brief` | PASS | PASS |
| `npm run verify:activity-state-trail` | PASS | PASS |
| `npm run verify:initiative-activity-link` | PASS | PASS |
| `npm run verify:meddic-stakeholder-map` | PASS | PASS |
| `npm run verify:ingestion-foundation` | PASS | PASS |
| `npm run verify:product-positioning-demo-path` | PASS | PASS |
| `npm run verify:commercial` | PASS | PASS |
| `npm run verify:cohort` | PASS | PASS |
| `npm run verify:no-ai` | PASS | PASS |
| `npm run verify:rate-limit-runtime` | PASS | PASS |
| `npm run verify:production-readiness` | PASS | PASS |
| `npm run verify:health-runtime` | PASS | PASS |
| `npm run verify:data-isolation` | PASS | PASS |
| `npm run verify:data-isolation-runtime` | PASS | PASS |
| `npm run verify:lead-ops` | PASS | PASS |
| `npm run verify:lead-ops-runtime` | PASS | PASS |
| `npm run verify:auth-recovery` | PASS | PASS |
| `npm run verify:trust-boundary` | PASS | PASS |
| `npm run verify:admin-console` | PASS | PASS |
| `npm run verify:support-cohort` | PASS | PASS |
| `npm run verify:activation-workflow` | PASS | PASS |
| `npm run verify:cloud-json-runtime` | PASS | PASS |
| `npm run verify:cloud-collection-tables` | PASS | PASS |
| `npm run verify:user-profile` | PASS | PASS |
| `npm run verify:legal-entity` | PASS | PASS |
| `npm run verify:billing-paid-readiness` | PASS | PASS |
| `npm run verify:trial-entitlement` | PASS | PASS |
| `npm run verify:accessibility-failure-state` | PASS | PASS |
| `npm run verify:commercial-fulfillment` | PASS | PASS |
| `npm run verify:daily-commercial-priority` | PASS | PASS |
| `npm run verify:daily-execution-loop` | PASS | PASS |
| `npm run verify:sales-flow-execution` | PASS | PASS |
| `npm run verify:operating-system-execution` | PASS | PASS |
| `npm run verify:commercial-operating-loop` | PASS | PASS |
