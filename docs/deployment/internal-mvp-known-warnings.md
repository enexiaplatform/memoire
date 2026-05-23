# Internal MVP Known Warnings

`npm run lint` currently passes with 5 known warnings. They are unrelated to the Pipeline Defense local-first MVP.

## Warning Inventory

| File | Warning Type | Pipeline Defense Impact | Recommended Future Fix | Blocks Deploy |
| --- | --- | --- | --- | --- |
| `src/features/entities/useEntities.ts` | `react-hooks/exhaustive-deps`: missing `fetchEntities` dependency | No direct impact. Legacy/entity hook is outside Pipeline Defense. | Wrap `fetchEntities` in `useCallback` and include it in the effect dependency array. | No |
| `src/features/entities/useEntityDetail.ts` | `react-hooks/exhaustive-deps`: missing `fetchDetail` dependency | No direct impact. Legacy/entity detail hook is outside Pipeline Defense. | Wrap `fetchDetail` in `useCallback` and include it in the effect dependency array. | No |
| `src/features/history/useCaptures.ts` | `react-hooks/exhaustive-deps`: missing `fetchCaptures` dependency | No direct impact. History hook is outside Pipeline Defense. | Wrap `fetchCaptures` in `useCallback`, stabilize filter dependencies, and include the callback in the effect. | No |
| `src/hooks/useDeals.ts` | `react-hooks/exhaustive-deps`: missing `fetchDeals` dependency | No direct impact. Legacy deal hook is outside Pipeline Defense. | Wrap `fetchDeals` in `useCallback` and include it in the effect dependency array. | No |
| `src/hooks/useDeals.ts` | `react-hooks/exhaustive-deps`: missing `fetchDeal` dependency | No direct impact. Legacy deal hook is outside Pipeline Defense. | Wrap `fetchDeal` in `useCallback` and include it in the effect dependency array. | No |

## Decision

The warnings were documented rather than fixed in Phase M.17 to avoid changing legacy data-fetch behavior before internal deployment. They should be handled in a focused cleanup pass after the internal MVP is stable.
