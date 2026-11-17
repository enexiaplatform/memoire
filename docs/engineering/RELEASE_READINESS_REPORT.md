# Memoire release readiness

Assessment date 2026-11-17. This is the release candidate for the existing native workspace and Capture/Plan improvements. See the [AI extension PRD](../product/MEMOIRE_AI_EXTENSION_PRD.md) for the remaining product scope.

| Boundary | Evidence or gap |
| --- | --- |
| Current production baseline | GitHub CI passed for `7b8eb1c`. Vercel's production alias pointed to a Ready deployment for the same source and health returned five required checks passing. |
| Current product regression | The final candidate passed `npm run check` with 2,346 tests and all repository contracts, with production workspace flags enabled in the build. |
| Same-account workspace switching | The migrated PostgreSQL harness exercised two named books under one login in A → B → A order. Quotes, receivables, account and opportunity records, activities, reports, currency and automation input stayed scoped. |
| Copy | The browser exercised source selection, preview, confirmation, Contacts dependency, created sample data and safe return to the source. The deployed create procedure stores the source and selected categories, performs atomic copy and validates the source owner. The UI previews categories. Individual rows are selected by the existing copy procedure. |
| Capture and Plan | Existing activity links can be reused. Stable Activity IDs and loss-of-response fixtures verify one saved record on retry. Offline storage refusal leaves the Capture form open. |
| Security and data | New test data was synthetic and confined to local fixtures. The candidate adds no Supabase migration. Workspace names and credentials come from the existing authenticated flow. Archived legacy links retain current behavior. |
| Remaining extension | Event unification across all direct edits, event-triggered execution, approval authority, scoped RFQ extraction and commercial quote drafting still need implementation and separate release verification. |

## Rollout boundary

Vercel tracks GitHub `master`. The release commit should descend from the current production source. Use the repository's full CI with the exact release commit and verify the production alias and public health after the Git deployment. Authenticated smoke with synthetic accounts and related records is additional evidence. Public health alone cannot verify those private flows.
