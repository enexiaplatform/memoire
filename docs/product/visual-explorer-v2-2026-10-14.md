# Memoire Visual Explorer v2

Implements the 13 October advanced-visualization research report. Local upgrade, not a production release. Concept: `visual-explorer-v2-concept-2026-10-14.png`, explicitly illustrative. The user's existing instruction to decide the design independently remains the design authorization.

## Design contract

One dominant scene answers: where do recorded estimates concentrate, and how do customers connect across brands? Warm ivory ground, direct labels, six restrained category colors expanded as necessary, quiet dividers, and a narrow inspector replace the equal-weight chart cards. The concept is a compositional reference; factual labels, values and connections are drawn from workspace records. Selected opportunities remain in their real group position rather than becoming an invented central hub.

- **Portfolio map:** one circle per non-lead opportunity; circle area is proportional to the recorded estimate above a disclosed minimum radius. Unknown values are dashed hollow marks; zero is hollow. Brand regions enclose packed records and are not themselves a monetary scale. Responsive small multiples use one common geometric scale across brands. Position/distance has no numerical meaning.
- **Connections:** only shown for a preview/selected opportunity, joining other opportunities for the same normalized customer, with confirmed merge aliases applied. Missing customers never form a shared bucket. No inferred causal relations, proximity claims or invented links.
- **Value & probability:** recorded percentage versus recorded estimate, linear/log1p value scale. Missing values/probabilities are omitted from this scatter view with explicit coverage. Selection and inspector identity survive switching modes.
- **Supporting views:** brand estimate ranking, brand × stage counts, and creation-month history. Each keeps its own filter dimension's alternatives available. Pale background bars preserve context; foreground marks show the selection. Creation dates are not stage movement history.
- **Inspector:** source name/account, estimate, stage/status, recorded probability, next action/date, same-customer opportunity list and source-record navigation. Long matching-record lists are folded by default.

## Technical and interaction contract

React owns the shell, native filters, SVG marks, keyboard navigation and selection. `d3-hierarchy` supplies deterministic front-chain packing for each brand; there is no animation loop or physics simulation. The dense scene is capped at 1,000 marks, with selected records beyond that cap inserted into the visible set. Counts, crossfilter views, search, matching records and CSV export retain all records. Coverage caveats identify the cap. More extensive books need search/filter/zoom for legibility; no GPU-scale claim is made.

Currency remains explicit and isolated. Totals describe current estimates across all statuses, not realized revenue, cash or probability-weighted forecasts. Missing/invalid money is never silently converted to zero. Source text identifies demo versus workspace data and original recorded brand text.

URL state includes mode, currency, brand/stage/month/search, selected record, zoom, pan and brush. Map brushes persist stable record IDs rather than screen coordinates; probability brushes persist probability/value bounds. Selections therefore retain their meaning across responsive reflow. Hover and drag-in-progress are transient. Reset removes only `vx*` state. New filters clear the prior plot selection. Existing Review export remains intact; explorer export adds a vector scene, selected CSV records and view/source settings.

Desktop keeps the scene and inspector side by side. Portrait stacks the scene before inspection; supporting views and matching records are collapsed. Landscape restores the side inspector. Normal touch preserves page scrolling; explicit pan/brush tools capture gestures. Zoom/reset buttons and searchable record controls supplement direct picking. Arrow keys browse points, Enter commits selection, Escape clears it. No essential quantitative information requires hover. SVG export includes semantic title/description and inline mark styling.

## Evidence and limitations

The browser fixture now uses seeded, skewed estimates, uneven creation dates, independent stage/category distributions, missing values and explicit cross-brand customer relations. It is isolated demo data, not customer data. Evidence is in `.audit/visual-explorer-v2/`: overview, selected, mobile and landscape screenshots, export ZIP and machine-readable results.

Data tests cover determinism, non-overlap, containment and circle-area ratios, canonical account merges, missing customers, currency isolation, unknown versus zero, intersecting filters and safe CSV export. Browser checks cover five real same-customer edges for the fictional selected record, inspector/source drill-through, URL reload, record identity across modes, own-filter alternatives, zoom/brush, keyboard, export parity and responsive overflow.

The mobile audit also reproduced intrinsic-width overflow in existing Review analytics panels below the new scene. Scoped minimum-width rules make those panels shrink while their tables retain local scrolling.

No history replay is fabricated from current state or `updatedAt`. Historic journey visualization remains a separate future task requiring event-coverage validation. No cloud schema, permission or production data changes are part of this upgrade.

Verification results: full unit suite passed **2,211 tests**. The five explorer-specific data tests passed after the layout refinements. TypeScript, production build and targeted ESLint passed. Browser assertions passed, including preservation of both map-ID selections and probability/value bounds across mobile reflow. The exported selected brand contained **50 records**, matching its CSV rows exactly. Existing derived-model performance budgets passed. A separate local layout benchmark packed **1,000 opportunities / 12 brands in 6.51 ms**; this measures geometry preparation only, not browser rendering or network latency.
