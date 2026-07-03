# Pipeline Insight Charts: Visual Layer for the Solo Operator

Date: 2026-07-03
Driver: founder feedback - the app was text-only (tables, lists, badges); a solo operator scanning between calls needs numbers as pictures. Strategy constraint respected: these are action-driving glances over existing data and classifiers, not BI analytics; no chart library added (hand-rolled SVG/DOM components keep the slim critical path from `public-load-performance-2026-07-02.md`).

## Chart kit (`src/components/charts/`)

- `SegmentBar` - horizontal stacked distribution bar with legend (counts + money detail).
- `MiniBarChart` - vertical bars; supports a pale full-height secondary bar behind the solid primary (weighted vs full value).
- `Sparkline` - compact SVG area line with per-point dots and labels.
- `FunnelBars` - horizontal per-stage bars scaled to the largest row.

All ~250 lines total, zero dependencies, brand colors, `role="img"` + aria-labels.

## Data builders (`src/utils/pipelineInsights.ts`)

- `buildPipelineHealthSummary` - active deals bucketed by the shared silence classifier (healthy / at-risk / silent) with VND-base money per bucket, money-going-quiet total, and top-account concentration share.
- `buildRevenueHorizon` - active value bucketed by normalized `expectedClosePeriod` horizon (This month / Next month / This quarter / Next quarter / Later / No close period), raw and probability-weighted (default 50% when unset). Horizon buckets are honest to the free-text field; no fake month precision.
- `buildStageFunnel` - active count + value per stage.
- `buildWeeklyTouchSeries` - customer touches per week (8 weeks, Monday-based).
- `buildWinLossByQuarter` - won/lost counts per quarter (4 quarters, by `updatedAt`).

## Placement

- **Today** (`PipelineGlanceSection`): Pipeline health strip - the headline states the stake ("X VND is going quiet"); concentration warning appears at >= 40% single-account share; Expected revenue chart answers "when does the money land".
- **Opportunities** (`PipelineShapeCharts`): stage funnel + close-horizon chart above the master table.
- **Weekly Brief** (`ExecutionRhythmCharts`): follow-up rhythm sparkline (calls out "below your usual pace") + won/lost per quarter.

All sections hide when there is no data to draw.

## Demo data

Sample dataset gained one Won (Northstar Foods, line audit, 480M, ~25 days ago) and one Lost (Orion Pharma, LIMS expansion, 1.2B, ~80 days ago) opportunity so win/loss surfaces demo properly. `verify-product-positioning-demo-path` guard updated: 3-7 sample opportunities, and now requires one Won and one Lost outcome.

## Verification

- `npm run check` passed (lint, build, all contract scripts).
- Demo-sandbox runtime: Today renders the health strip (4 healthy / 1 silent - 650M VND quiet) and revenue chart; Opportunities renders the funnel (Discovery 650M x1, Proposal 970M x2, Negotiation 2.4B x1, Procurement 900M x1) and horizon chart; Weekly Brief renders the touch sparkline and won/lost quarters. No console errors.

## Glance-to-action wiring (added later on 2026-07-03)

The Today pipeline-health card now carries a "Rescue the quiet deals" CTA (shown only when quiet money > 0) that deep-links to `/app/opportunities?filter=goingSilent`. OpportunitiesPage accepts a `filter` URL param (validated against the quick-filter set, then cleared from the URL) so any surface can link straight into a filtered pipeline view. Verified in the demo sandbox: the CTA lands on Opportunities with the "Going silent" chip active and the table filtered to the one quiet deal; no console errors.

## Deliberately not added

Dashboards-for-their-own-sake: no filters on charts, no drill-down analytics, no date-range pickers, no export. Each chart answers one operating question; anything deeper belongs to cohort-evidence decisions per the GTM strategy.
