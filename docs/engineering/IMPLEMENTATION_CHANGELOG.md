# Implementation changelog

## 2026-11-17 development checkpoint

- Established the architecture and workflow baseline at `4a5f55e`. Ran the complete build, API types, lint, Node test and contract chain before editing application code.
- Worked in `codex/commercial-extension` in a separate working tree. The original working tree contained ten uncommitted Capture and Plan edits.
- Invalidate stored workspace query results and in-flight cache entries when the browser owner changes. Remount protected content when the authenticated account changes.
- Scope delayed collection merges, cloud writes initiated after identity checks, local fallbacks, selected account and stakeholder writes, Capture retries, workspace aggregation and financial preference hydration to the owner generation that started them. A return to the same account after a different account occupied the browser is a new generation.
- Add an additive opportunity/account ownership trigger for inserts and changed links. It preserves the existing optional foreign key relationship and the legacy rows already stored.
- Add eight browser-store race regression cases and three migrated-database cases, alongside the existing suite. Keep existing report/dashboard error wording and update the asset test's cache mock for the shared invalidation contract.
- Record the remaining same-account isolation gate, automation architecture and Commercial AI acceptance criteria in the companion documents.

Same-account workspace creation, switching and selective copy, the Capture command unification, event automation and Commercial AI remain open. No production rollout was performed.
