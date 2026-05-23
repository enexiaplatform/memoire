# Phase M.15 MVP Stabilization Regression Checklist

## 1. Brief Management

- Open `/app/pipeline-defense`.
- Confirm the active brief selector appears in Workspace Mode.
- Create a new brief.
- Rename the brief.
- Edit week label, sales owner, and scope.
- Duplicate the brief.
- Switch between briefs.
- Delete a brief.
- Confirm at least one brief remains available.

## 2. Local Persistence

- Edit brief metadata.
- Edit at least one deal.
- Refresh the page.
- Confirm edits persist through `localStorage`.
- Confirm the active brief selection persists.

## 3. Import

- Open `Import Deals`.
- Paste supported CSV.
- Click `Parse Import`.
- Confirm parsed preview appears.
- Apply as Append.
- Repeat with Replace.
- Confirm imported deals appear in the active brief.
- Confirm invalid/empty input shows a helpful no-deals message.

## 4. Editing

- Add a deal.
- Edit account, opportunity, pipeline context, deal truth, risk type, evidence, missing context, objection debt, forecast category, decision recommendation, recommended action, and pipeline review answer.
- Remove a deal.
- Reset sample data.
- Confirm edit controls are available only in Workspace Mode.

## 5. Rules Engine

- Click `Analyze Deal` on a deal.
- Confirm suggested forecast category, decision recommendation, risk flags, next action, and explanation appear.
- Click `Apply Suggestions`.
- Confirm only forecast evidence category, decision recommendation, and recommended action update.
- Click `Analyze Deal Risks`.
- Confirm the rules summary appears.

## 6. Brief Quality

- Click `Check Review Readiness`.
- Confirm readiness status appears.
- Confirm issue counts and cleanup actions appear.
- Confirm issues are grouped by High, Medium, and Low.
- Click `Go to deal`.
- Confirm the matching deal card scrolls into view.

## 7. Action Plan

- Click `Generate This Week's Actions`.
- Confirm the Weekly Action Plan appears.
- Confirm actions are grouped by Critical, High, Medium, and Low.
- Confirm each action includes account, opportunity, title, detail, reason, type, owner, and due timing.
- Mark an action done.
- Confirm done state changes visually.
- Click `Copy Action Plan`.
- Confirm copied status or fallback textarea appears.

## 8. Draft Assist

- Click `Draft Assist` on a deal.
- Confirm `Draft provider: Local Mock` appears.
- Generate `Deal truth` and apply it.
- Confirm only `dealTruth` updates.
- Generate `Pipeline review answer` and apply it.
- Confirm only `pipelineReviewAnswer` updates.
- Generate `Recommended action` and apply it.
- Confirm only `recommendedAction` updates.
- Generate `Objection handling note`.
- Confirm it is copy-only.
- Generate `Manager question`.
- Confirm it is copy-only.

## 9. Export Markdown

- Click `Export Brief`.
- Confirm Markdown preview appears only after clicking export.
- Copy Markdown.
- Download `.md`.
- Close the preview.
- Confirm Draft Assist output and action plan are not mixed into the main brief export.

## 10. Print / Save PDF

- Click `Print / Save PDF`.
- Confirm browser print opens.
- Confirm sidebar, app controls, edit controls, import panel, and Draft Assist are hidden.
- Confirm active brief metadata and current deal data appear.
- Generate an action plan and print again.
- Confirm the generated action plan appears in print.

## 11. Review Mode

- Click `Enter Review Mode`.
- Confirm compact review view appears.
- Confirm active brief metadata, executive summary, review summary strip, and top at-risk deals appear.
- Confirm Add Deal, Remove, edit controls, Draft Assist, Import Deals, Reset sample data, Clear local storage, Delete Brief, and Duplicate Brief are hidden.
- Click `Check Review Readiness`, `Generate This Week's Actions`, `Analyze Deal Risks`, `Export Brief`, and `Print / Save PDF`.
- Confirm each still works.
- Click `Exit Review Mode`.
- Confirm the full Workspace Mode returns.

## 12. Empty States

- Remove all deals.
- Confirm the no-deals empty state appears.
- Confirm `Analyze Deal Risks` is disabled or non-destructive.
- Click `Check Review Readiness`.
- Confirm empty-brief readiness issue appears.
- Click `Generate This Week's Actions`.
- Confirm no-deals action-plan message appears.
- Enter Review Mode.
- Confirm no-deals review state appears without edit/admin controls.

## 13. Legacy Migration

- If possible, seed `memoire.pipelineDefenseBrief.v1` with a legacy single draft array.
- Clear `memoire.pipelineDefenseBriefs.v1`.
- Reload `/app/pipeline-defense`.
- Confirm the legacy draft migrates into the multiple-brief store.
- Confirm the new key `memoire.pipelineDefenseBriefs.v1` is populated.

## 14. No Network / API Check

- Search implementation for:
  - `fetch`
  - `XMLHttpRequest`
  - `OpenAI`
  - `Claude`
  - `Gemini`
  - `API key`
  - `VITE_`
  - `REACT_APP_`
- Confirm no real AI provider, backend call, API key, environment variable, or network request was added for Pipeline Defense.

## Build And Lint

- Run `npm run build`.
- Run `npm run lint`.
- Confirm build passes.
- Confirm lint has no new errors and only pre-existing warnings remain.
