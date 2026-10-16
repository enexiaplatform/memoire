# Memoire Visual Explorer

Implemented in Review → Learning & Analytics. The user's supplied reference informs dense, coordinated exploration. The user authorized independent design decisions; no separate concept approval is pending.

## Reading and interaction contract

- Landscape: each point is one non-lead opportunity; stage or recorded probability on x, current recorded estimate on y. Linear/log1p scale toggle. Status uses blue (Active), green (Won), rose (Lost), amber (On hold). Category spread is deterministic and explicitly disclosed. Drag selection filters the linked views.
- Brand ranking: opportunity counts with known estimate totals, sorted by selected count. Native buttons filter a brand.
- Brand × stage matrix: counts with a neutral empty state and blue intensity; explicit numeric labels. Cell selection intersects brand and stage.
- Creation history: monthly counts, gray currency/search context and blue selected subset. Uses local creation month; no claim about revenue or closing history.
- Record table: the selected records, 12 per page, unknown values stated, links to the existing opportunity drawer.

React owns all marks, geometry, layout and interactions. A bespoke SVG plot plus native HTML bars/matrix fits the existing dependency-free chart conventions. Four views coexist. The SVG is capped at 1,500 points with an explicit coverage notice; aggregation, filtering and export retain all records. Matrix counts use indexed aggregation rather than repeated scans. No continuous animation, network fetching, new database tables or new navigation destination.

## Data, state and fallback

All readings derive from the already loaded owner-scoped workspace. Demo provenance is visible. Brands use existing canonical spelling normalization; this explorer explicitly reads recorded brand text, not portfolio catalog assignments. Currency is selected explicitly; totals never mix currencies or substitute FX. Missing, infinite and negative money is unknown; zero is valid. Missing/out-of-range probability is unknown. The view describes estimates across all statuses, not pipeline forecasts, booked revenue or realized cash. Leads are excluded.

Filters, currency, plot mode, scale and rectangular selection use `vx*` URL parameters; reset preserves the Review tab and unrelated URL state. Browser Back/Forward and reload restore committed views. Invalid currency and brush settings fall back safely. Pagination and active drag are transient. Export contains selected CSV records, one vector SVG plot and view/source settings, with formula-like text escaped. Existing Review PNG/CSV export remains available.

Desktop uses a large landscape with adjacent ranking and lower comparison views. At 390 px, panels stack with evidence first; plot width/height and label spacing adapt. Matrix/table scroll locally, never the page. Touch retains native vertical scrolling and uses native buttons for selection; keyboard users use the same filters, matrix and record table. Hover titles are supplemental. Numeric labels preserve meaning without color. No motion or sensor permissions are required. Existing workspace sync status remains the authority for live/offline status.

## Verification

Local specialist passes: SVG geometry, React integration, mobile continuation and React quality review. Analytical checks cover mixed currencies, zero versus unknown, intersecting filters, canonical brand spelling, invalid probability/date, complete CSV export and formula safety.

Browser verification uses 240 explicitly fictional opportunities in an isolated demo browser. Checks cover filter coordination, URL reload, CSV row-count parity, SVG export, scale/axis changes, rectangular brushing, empty search, mobile overflow and opening a selected opportunity. Evidence is written to `.audit/visual-explorer/`. This is local implementation verification, not a production release.

Results: 2,209 unit tests passed (including three explorer data checks); targeted ESLint passed without warnings; TypeScript and production build passed; existing derived-model performance budgets passed. The browser suite passed with a seven-record selected export matching all CSV rows, at desktop 1440 px and mobile 390 px. Preview: `.audit/visual-explorer/preview.png`; desktop/mobile screenshots and `result.json` are beside it.
