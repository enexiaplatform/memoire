# Henry Founder Workspace QA Report

Date: 2026-05-04

Scope: QA pass only for the approved Henry Founder Workspace seed. No app features, data model changes, Supabase migration, review-flag UI, pricing UI, or Open timing date conversion were implemented.

## 1. QA Flows Tested

| Flow | Result | Evidence |
| --- | --- | --- |
| Load workspace from Login | Partial | `Load Henry Workspace` appears only when demo mode is active and Supabase env is effectively unavailable. With current `.env`, Supabase is configured, so `VITE_ENABLE_DEMO_MODE=true` alone does not show the button. |
| TopNav trust badges | Pass after local demo override | TopNav shows `Demo Mode` and `Henry Founder Workspace` after loading the workspace. |
| Today | Pass with issues | Today shows Top Revenue Actions, Needs Attention, Due / Overdue Actions, Quick Capture, What Changed, and Sales Pattern. It answers the daily action question, but timing labels should be clearer. |
| Journey | Pass with issues | Journey shows Active Journeys from seeded accounts/opportunities, Broken Loops, and Memory Health badges. Timing actions are not hard due dates, but they are not explicitly labeled as tentative. |
| Account Memory | Pass with issues | Target accounts render Living Memory, notes, contacts, blockers, open actions, and narratives. Some narrative wording is mechanically repetitive but does not invent missing fields. |
| Opportunity Memory | Partial | Target opportunities are linked to correct accounts and show product/brand context. No `win probability`, `deal score`, or `forecast` wording appears, but `Confidence` is visible and appears derived from source probability. |
| Ask Memoire | Partial | Specific account/opportunity context works better than All Memory. All Memory / attention question can return a generic or contaminated answer instead of ranked needs-attention output. |

## 2. Pass / Fail Per Flow

### 2.1 Load Workspace

Status: Partial

What passed:
- When local demo mode is truly active, the login page shows `Load Henry Workspace`.
- Clicking it signs in as `henry@memoire.local`.
- User lands on `/app/today`.
- TopNav shows both `Demo Mode` and `Henry Founder Workspace`.

What failed:
- With the current `.env`, Supabase URL and anon key are configured.
- Current `isDemoMode` logic requires both:
  - `VITE_ENABLE_DEMO_MODE=true`
  - Supabase not configured
- Therefore, simply setting `VITE_ENABLE_DEMO_MODE=true` is not enough to show `Load Henry Workspace`.

QA note:
- I used a temporary local override during QA so Supabase client env was blank and demo mode could be tested. The override was only for QA and should not be treated as product behavior.

### 2.2 Today

Status: Pass with issues

What passed:
- `Top Revenue Actions` appears first.
- `Needs Attention` appears and surfaces broken loops and Memory Health issues.
- `Due / Overdue Actions` appears.
- `Quick Capture` appears after action sections.
- `What Changed` appears.
- `Sales Pattern` appears.
- The page clearly answers: "What should Henry do today to move revenue forward?"

Observed examples:
- `Engage Ms. Giao (26/02)` appears as overdue.
- `Review EM / PMM RTU timing (04Apr/W2)` appears as a revenue action.
- Broken loop appears for `Samil Pharmaceutical / EM / PMM Phase 2` with no next action.
- Sales Pattern shows `Missing Decision Context`.

Issues:
- Pipeline Open timing appears as action text such as `Review ... timing (04Apr/W2)`, but the UI does not explicitly label it as `tentative timing`.
- One existing local demo record appears mixed into the account list: `FT Pharma / tạo pipeline mới cho tôi`. This is expected if prior localStorage data exists because the founder seed intentionally does not overwrite demo data, but it can confuse QA unless Henry starts from a clean browser state.

### 2.3 Journey

Status: Pass with issues

What passed:
- Sales Memory Flow Map is visible.
- Active Journeys are populated from founder seed data.
- Broken Loops are populated.
- Memory Health badges appear on journey cards.
- Active accounts/opportunities include:
  - Samil Pharmaceutical
  - TV Pharm
  - Control Union
  - STADA Pymepharco
  - Terumo BCT Vietnam

Issues:
- Open timing is displayed as `Review ... timing (03Mar/W1)` or similar, but not explicitly labeled `tentative`.
- Some cards show `Broken` mainly because contact context is missing. This is correct data-wise, but Henry may need explanation that missing contacts were intentionally not invented.

### 2.4 Account Memory

Status: Pass with issues

Accounts checked:
- STADA Pymepharco
- Samil Pharmaceutical
- TV Pharm
- Control Union
- Terumo BCT Vietnam

What passed:
- Account Narrative does not invent decision makers or decision timelines.
- Contacts shown are real seeded contacts, not placeholders.
- Background / strategic rationale records are shown as `note`, not as calls or meetings.
- Objections/blockers are explicit:
  - TV Pharm: `Tender/procurement status pending`
  - Terumo BCT Vietnam: `Sartorius incumbent context`
- Open Actions are useful and linked to account memory.

Issues:
- Narrative text is safe but mechanically repetitive, for example double periods after quoted source text.
- STADA and Samil show `Confidence: high` in Decision context; this is likely derived from source probability and may feel like a deal score if Henry is sensitive to forecast language.
- TV Pharm has two similar tender/procurement blocker cards because one comes from Special Project context and one from pricing context. This is not hallucinated, but it may need deduplication later.

### 2.5 Opportunity Memory

Status: Partial

Opportunities checked:
- TV Pharm / VHP / SolidFog EU-GMP Phase 2
- Control Union / UV-VIS / Scitek instrument
- STADA Pymepharco / EM / PMM RTU
- Terumo BCT Vietnam / Canister / Tailin consumables

What passed:
- Account linking is correct.
- Product / brand / channel context is visible through opportunity names and source-seeded details.
- No visible `win probability`, `deal score`, `forecast`, or `pipeline analytics` wording was found in the primary opportunity UI.
- Open timing is not converted into hard due dates; related action rows show `No due date`.

Issues:
- `Confidence` is visible on opportunity cards and account decision context. Because the founder seed derives confidence from source probability, this may violate the spirit of "probability remains raw context" even though it is not labeled as win probability.
- `Commercial movement` displays dollar values. This is useful opportunity context, but it should be product-reviewed to ensure it does not push the page toward forecast/reporting perception.
- Tentative timing is not visually labeled as tentative.

### 2.6 Ask Memoire

Status: Partial

Questions tested:
- `Summarize STADA Pymepharco`
- `What is blocking TV Pharm?`
- `What should I do next for Control Union?`
- `Which accounts need attention?`
- `What needs attention?`

What passed:
- Specific Account context works for STADA Pymepharco.
- Specific Account context works for TV Pharm blocker.
- Specific Opportunity context works for Control Union next action.
- Answers show `Based on / Context used`.
- Missing context appears, such as `Decision maker` and `Recent interaction`.
- No decision maker or decision timeline was invented.

Issues:
- All Memory attention questions are weak. `Which accounts need attention?` and even `What needs attention?` returned a generic account-style answer instead of using Broken Loops / Memory Health / Needs Attention ranking.
- The All Memory answer was contaminated by an existing local demo record (`FT Pharma / tạo pipeline mới cho tôi`) because prior localStorage data was present and founder seed does not overwrite it.
- All Memory answer mixed objections across accounts into one answer, which creates over-inference risk.

## 3. Screens / Pages With Issues

| Screen | Issue | Severity |
| --- | --- | --- |
| Login | `Load Henry Workspace` does not appear with current Supabase-configured `.env` even when `VITE_ENABLE_DEMO_MODE=true`. | High |
| Today | Tentative Open timing actions are not explicitly labeled as tentative. | Medium |
| Journey | Tentative timing actions are not explicitly labeled as tentative. | Medium |
| Account Memory | Duplicate TV Pharm tender blocker appears from two explicit sources. | Low |
| Account Memory | Narrative copy has minor mechanical wording issues. | Low |
| Opportunity Memory | `Confidence` may be perceived as probability/deal scoring. | Medium |
| Ask Memoire | All Memory / attention questions do not use Needs Attention logic reliably. | High |
| Founder QA State | Existing local demo data can mix into founder workspace because seed intentionally merges and does not overwrite. | Medium |

## 4. Data Issues Found

1. Existing localStorage data can contaminate founder QA if Henry previously tested demo flows.
   - Example observed: `FT Pharma / tạo pipeline mới cho tôi`.
   - This is not a seed import bug; it follows the approved no-overwrite rule.

2. TV Pharm has two explicit tender/procurement blockers:
   - One from Special Project / tender status.
   - One from pricing context.
   - Both are source-backed, but they may look duplicated to the user.

3. Many accounts/opportunities correctly show missing contact context.
   - This is expected because contacts were imported only from real non-placeholder KA account tabs.

4. Pipeline Open timing is preserved safely with no hard due date.
   - However, UI wording should mark it as tentative so Henry does not mistake it for a scheduled due date.

5. Source probability appears to influence visible `Confidence`.
   - This should be reviewed against the approved probability rule.

## 5. UI Wording Issues Found

1. `Review ... timing (04Apr/W2)` should probably read:
   - `Review tentative timing: 04Apr/W2`
   - or `Review source open timing: 04Apr/W2`

2. `Confidence: high/medium/low` may read like a deal score.
   - Suggested product-safe wording:
     - `Source confidence hint`
     - or hide confidence for founder seed opportunities if it is derived from pipeline probability.

3. `Commercial movement` is acceptable, but Henry should review whether visible dollar values feel too forecast-like for validation.

4. Account Narrative fallback copy is safe but stiff.
   - It should remain template-based for now, but punctuation cleanup would improve trust.

## 6. Hallucination Or Over-Inference Risk

| Area | Risk | Severity |
| --- | --- | --- |
| Account Narrative | Low. It uses available fields and shows missing context. No invented decision maker/timeline observed. | Low |
| Ask Memoire specific account/opportunity | Low to Medium. Specific context answers were grounded and showed missing context. | Low |
| Ask Memoire All Memory | High. It can mix unrelated objections and answer from the wrong local record instead of ranking accounts needing attention. | High |
| Memory Health / Sales Pattern | Medium. `Missing Decision Context` is valid as a missing-field pattern, but it may feel broad because many seed records intentionally lack decision data. | Medium |
| Opportunity Confidence | Medium. It may over-interpret source probability as confidence. | Medium |

## 7. Recommended Fixes

Do not implement without product review unless Henry approves.

1. Fix founder workspace activation in local QA.
   - Option A: allow `VITE_ENABLE_DEMO_MODE=true` to show `Load Henry Workspace` even when Supabase env exists.
   - Option B: add a separate explicit flag like `VITE_ENABLE_FOUNDER_WORKSPACE=true`.
   - Keep it intentional; do not auto-load.

2. Add visible tentative wording for Pipeline Open timing.
   - Keep `dueDate` empty.
   - Change labels only, not data model.

3. Make Ask Memoire All Memory route needs-attention questions through existing Broken Loop / Memory Health helpers.
   - This is behavior change, so it needs product review.

4. Reduce or relabel visible `Confidence` if derived from pipeline probability.
   - Avoid anything that can be mistaken for win probability or deal score.

5. Provide a QA reset instruction for Henry.
   - Because deleting local demo data is a destructive local action, do not clear it automatically.
   - Henry should test in a clean browser profile or manually clear local demo storage before founder QA if he wants a pure founder workspace.
   - See `docs/data/henry-founder-workspace-manual-test-guide.md`.

6. Consider deduplicating exact/similar objections by account/category/source text later.
   - Not required before initial manual test unless duplicate blockers confuse Henry.

## 8. Must-Fix Before Henry Manual Test

1. Founder workspace load path must be clear.
   - Current `.env` has Supabase configured, so `Load Henry Workspace` is hidden even with `VITE_ENABLE_DEMO_MODE=true`.

2. Ask Memoire All Memory needs-attention behavior must be corrected or Henry should avoid using All Memory attention prompts during first validation.
   - Specific Account and Specific Opportunity context are acceptable for manual test.

3. Henry should test with clean local demo storage or expect prior demo records to remain mixed with founder seed.

## 9. Nice-To-Have Later

1. Add copy-only `tentative timing` label to timing-derived actions.
2. Polish Account Narrative punctuation and fallback sentence flow.
3. Review whether `Commercial movement` values should remain visible in validation.
4. Add safe deduplication for duplicate explicit blockers.
5. Add founder review flag visibility later, but not in this QA phase.

## 10. Build / Lint Result If Changed

Result: Pass

This QA pass created only this report file:

- `docs/data/henry-founder-workspace-qa-report.md`

No product behavior fixes were implemented.

Verification run:

- Targeted lint passed for the founder workspace implementation files.
- Production build passed with the existing Vite chunk-size warning.
