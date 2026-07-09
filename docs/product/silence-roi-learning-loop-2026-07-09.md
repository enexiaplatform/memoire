# Silence ROI + Learning Loop Wave

Date: 2026-07-09
Strategy source: `docs/product/product-strategy-gtm-2026-07-02.md` (Sections 2.1, 2.3), `docs/product/commercial-readiness-audit-2026-07-04.md` (silence loop as moat).

## Problem

The silence loop (detect -> draft -> log as sent -> book next touch) was complete but silent about its own results. Nothing proved to the seller that follow-ups actually revive deals - the core willingness-to-pay evidence. Ask Memoire was purely reactive, capture still required typing, and resolved objections never became reusable knowledge.

## Changes

### 1. Saved from silence (follow-up ROI)

- `src/utils/followUpImpact.ts`: for every logged follow-up in the last 30 days, measures whether the deal was quiet beforehand (>= 7 days, matching the silence classifier warning window) and what happened after: `revived` (a later customer touch), `won` (Won outcome or status after the follow-up), `protected` (future next action booked), `waiting` (nothing yet). Value is summed in the reporting currency for back-in-motion deals only - waiting deals never inflate the metric.
- `FollowUpImpactPanel` on Today (hidden until at least one follow-up is logged) and a `Saved From Silence (Last 30 Days)` section in the share-ready Pipeline Defense markdown, so the activation artifact carries the rescue story.
- Contract: `scripts/verify-follow-up-impact-contract.mjs` (`npm run verify:follow-up-impact`).

### 2. Morning Brief (proactive Ask Memoire)

- `src/utils/morningBrief.ts` + `MorningBriefCard` on Today: urgent-deal headline from live nudges, yesterday's captured touches, follow-ups still waiting on a reply, and up to three ready-to-run questions deep-linked as `/app/ask?question=...`.
- `AskMemoirePage` consumes a `question` URL param once workspace context loads and runs it automatically (guarded so it fires once).
- Contract: `scripts/verify-morning-brief-contract.mjs` (`npm run verify:morning-brief`).

### 3. Voice dictation on Capture

- `src/hooks/useSpeechDictation.ts` wraps the Web Speech API; the Capture note input gains a Dictate button (hidden when unsupported). Final transcript chunks append to the note; copy states audio stays in the browser's own speech service. No audio or transcript is sent to Memoire servers.

### 4. Objection learning layer

- `src/utils/objectionPlaybook.ts`: per objection type - resolution rate, the seller's own proven responses (resolution notes, newest first), and deals lost to that objection type (lost-outcome reason categories plus free-text matching on `objectionThatMattered`).
- "What worked against objections" section on the Playbook page, hidden below 3 captured objections so sparse data never overclaims.
- Contract: `scripts/verify-objection-playbook-contract.mjs` (`npm run verify:objection-playbook`).

### 5. Demo data

- New Northstar Foods "Line audit service" story: 16 quiet days -> logged follow-up (9 days back) -> deal Won. The public demo's Saved from silence panel shows "Won after follow-up" with 480M VND back in motion next to Summit Diagnostics "Waiting on reply" - the before/after of the wedge in one panel.
- Two Apex Labs objections flip to Resolved with real resolution notes so the objection playbook renders proven responses out of the box.

## Evidence-to-action pass (added later on 2026-07-09)

- Saved from silence panel also renders on the Weekly Brief, scoped to the selected review period (week/month, past periods included); full activity history feeds attribution so pre-period quiet gaps stay honest.
- Waiting-on-reply deals in the Today panel carry a Draft follow-up button that opens the composer prefilled from the flagged deal - the ROI panel is a working queue, not a scoreboard.
- Objection playbook gains "Copy proven responses" (`generateObjectionPlaybookMarkdown`) so resolved-objection language pastes straight into a follow-up draft.
- Morning Brief silence questions now deep-link with `scope=opportunity&opportunityId=...` (ids survive the v31 adapter), so Ask Memoire answers from that deal's memory. Runtime smoke confirmed the Ask page shows "Current context: QC workflow" for the demo's flagged deal.

## Explicitly not built

Forward-to-Memoire inbound email (needs server-side email infrastructure; conflicts with the current trust boundary "no inbox access" stance - founder decision required). No CRM sync, no team features, no new navigation entries: all five changes land inside existing 5+1 surfaces.

## Verification

- `npm run check` passed (build, typecheck, lint, full contract suite including the three new contracts).
- Runtime smoke (dev server + Chromium, fresh demo sandbox): Today shows Morning Brief and Saved from silence with the Won-after-follow-up chip; Playbook shows "What worked against objections" with proven responses; `/app/ask?question=...` seeds and auto-runs the question. Console shows only expected local-dev network noise for `/api/*` endpoints.

## Follow-ups

- Silence-rescue attribution currently uses deterministic rules (later touch = revived). Cohort interviews should validate whether sellers read "revived" as honest.
- Morning Brief question set is rule-based; deepen with Ask Memoire context packets once cohort evidence shows which questions get clicked.
