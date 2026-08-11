/**
 * The marketing page's charts.
 *
 * Every ramp below was run through the palette validator rather than picked by
 * eye, and the results are recorded so nobody has to re-derive them:
 *
 * - Order-to-cash funnel, dark surface, ordinal blue
 *   `#b7d3f6 #86b6ef #5598e7 #2a78d6 #184f95` - PASS (monotone L, gaps >= 0.06,
 *   light end 2.15:1, single hue). The brand's seven-hue spectrum FAILED as a
 *   categorical palette (indigo/purple/blue adjacent at deltaE 1.9 deutan), which
 *   is exactly why this is one hue: the funnel encodes one measure across
 *   ordered stages, so it was never a categorical job.
 * - Collection aging, dark surface, ordinal red
 *   `#f7c9c9 #ee9a9a #e06b6b #d03b3b #a32a2a` - PASS. Lateness is ordered
 *   magnitude, not four status categories; the fixed status palette put warning
 *   and serious at deltaE 13.6 normal-vision, below the 15 floor, so ordering it
 *   as one hue is both more correct and more legible.
 * - Portfolio coverage, light surface, sequential blue
 *   `#86b6ef #3987e5 #256abf #104281` - PASS. Empty cells are deliberately not
 *   the palest blue: "never sold here" is the point of the chart, so it gets a
 *   hollow neutral cell instead of a colour that reads as "a little".
 *
 * Shared rules applied: values and labels wear ink tokens rather than the mark
 * colour, marks are thin with 4px rounded ends, every fill has a 2px surface
 * gap from its neighbour, and each chart carries a screen-reader table so the
 * figures are never colour-only.
 */

type FunnelStage = {
  label: string;
  /** Share of the widest stage, 0-1. Drives bar length only. */
  fraction: number;
  value: string;
  count: string;
};

const FUNNEL_RAMP = ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#184f95'];

const FUNNEL_STAGES: FunnelStage[] = [
  { label: 'Quoted', fraction: 1, value: '$412,000', count: '11 quotes' },
  { label: 'Ordered', fraction: 0.62, value: '$255,000', count: '6 orders' },
  { label: 'Delivered', fraction: 0.44, value: '$182,000', count: '4 orders' },
  { label: 'Invoiced', fraction: 0.33, value: '$136,000', count: '3 invoices' },
  { label: 'Paid', fraction: 0.18, value: '$74,000', count: '2 settled' },
];

/**
 * Where money stops moving, as one bar per stage.
 *
 * A funnel rather than a line: these are ordered stages of the same money, and
 * the question it answers is "which step is the drop", which is a comparison of
 * magnitudes at a glance.
 */
export function OrderToCashFunnel() {
  return (
    <figure className="rounded-card border border-white/10 bg-white/[0.04] p-6">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold text-white">One quarter, quote to cash</span>
        <span className="text-[11px] font-semibold text-slate-400">$338,000 never made it to the bank</span>
      </figcaption>

      <div className="mt-5 space-y-2.5">
        {FUNNEL_STAGES.map((stage, index) => (
          <div key={stage.label} className="group flex items-center gap-3">
            <span className="w-20 flex-none text-[11px] font-semibold text-slate-300">{stage.label}</span>
            <div className="relative h-6 flex-1">
              <div
                className="h-6 rounded-r-[4px] transition-[filter] duration-150 group-hover:brightness-110"
                style={{ width: `${Math.max(stage.fraction * 100, 4)}%`, backgroundColor: FUNNEL_RAMP[index] }}
                title={`${stage.label}: ${stage.value} (${stage.count})`}
              />
            </div>
            <span className="w-24 flex-none text-right font-display text-xs font-extrabold text-white">{stage.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-slate-400">
        The gap between <span className="font-bold text-slate-200">Delivered</span> and{' '}
        <span className="font-bold text-slate-200">Invoiced</span> is work you have already done and not yet billed for.
      </p>

      {/* Wrapped rather than `sr-only` on the table itself: a CSS table treats
          width:1px as a minimum and grows to fit, which pushed the page sideways. */}
      <div className="sr-only">
        <table>
        <caption>Order to cash by stage</caption>
        <thead>
          <tr><th scope="col">Stage</th><th scope="col">Value</th><th scope="col">Count</th></tr>
        </thead>
        <tbody>
          {FUNNEL_STAGES.map((stage) => (
            <tr key={stage.label}>
              <th scope="row">{stage.label}</th>
              <td>{stage.value}</td>
              <td>{stage.count}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </figure>
  );
}

const AGING_RAMP = ['#f7c9c9', '#ee9a9a', '#e06b6b', '#d03b3b', '#a32a2a'];

const AGING_BUCKETS = [
  { label: 'Not yet due', fraction: 0.34, value: '$38,000' },
  { label: '1-30 days', fraction: 0.66, value: '$74,000' },
  { label: '31-60 days', fraction: 0.21, value: '$24,000' },
  { label: '61-90 days', fraction: 0.09, value: '$10,000' },
  { label: 'Over 90 days', fraction: 0.04, value: '$4,000' },
];

/** How late the money is, ordered by lateness rather than coloured by category. */
export function CashAgingChart() {
  return (
    <figure className="rounded-card border border-white/10 bg-white/[0.04] p-6">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold text-white">How late the money is</span>
        <span className="text-[11px] font-semibold text-slate-400">$150,000 outstanding</span>
      </figcaption>

      <div className="mt-5 space-y-2.5">
        {AGING_BUCKETS.map((bucket, index) => (
          <div key={bucket.label} className="group flex items-center gap-3">
            <span className="w-24 flex-none text-[11px] font-semibold text-slate-300">{bucket.label}</span>
            <div className="relative h-5 flex-1">
              <div
                className="h-5 rounded-r-[4px] transition-[filter] duration-150 group-hover:brightness-110"
                style={{ width: `${Math.max(bucket.fraction * 100, 3)}%`, backgroundColor: AGING_RAMP[index] }}
                title={`${bucket.label}: ${bucket.value}`}
              />
            </div>
            <span className="w-20 flex-none text-right font-display text-xs font-extrabold text-white">{bucket.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-slate-400">
        Every due date here was derived from the payment terms already written on the quote. Nothing was re-entered.
      </p>

      {/* Wrapped rather than `sr-only` on the table itself: a CSS table treats
          width:1px as a minimum and grows to fit, which pushed the page sideways. */}
      <div className="sr-only">
        <table>
        <caption>Receivables by age</caption>
        <thead><tr><th scope="col">Age</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          {AGING_BUCKETS.map((bucket) => (
            <tr key={bucket.label}><th scope="row">{bucket.label}</th><td>{bucket.value}</td></tr>
          ))}
        </tbody>
        </table>
      </div>
    </figure>
  );
}

const COVERAGE_RAMP = ['#86b6ef', '#3987e5', '#256abf', '#104281'];

const COVERAGE_LINES = ['Instruments', 'Consumables', 'Service', 'Training', 'Spares'];
const COVERAGE_ACCOUNTS = [
  { name: 'Meridian Group', cells: [3, 2, 1, 0, 0] },
  { name: 'Caldera Systems', cells: [3, 3, 2, 1, 0] },
  { name: 'Halden Industrial', cells: [2, 1, 0, 0, 0] },
  { name: 'Northwind Trading', cells: [1, 2, 0, 0, 1] },
  { name: 'Ardent Supply', cells: [2, 0, 0, 0, 0] },
];

/**
 * Every customer against every line you carry.
 *
 * The empty cells are the message, so they are drawn as hollow rather than as
 * the palest step of the ramp - "never sold here" must not read as "a little".
 */
export function CoverageHeatmap() {
  const sold = COVERAGE_ACCOUNTS.reduce((total, row) => total + row.cells.filter((cell) => cell > 0).length, 0);
  const totalCells = COVERAGE_ACCOUNTS.length * COVERAGE_LINES.length;

  return (
    <figure className="min-w-0 rounded-card border border-slate-200 bg-white p-6 shadow-card">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold text-slate-950">Portfolio coverage</span>
        <span className="text-[11px] font-semibold text-slate-500">
          {sold} of {totalCells} squares sold
        </span>
      </figcaption>

      <div className="mt-5 min-w-0 overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="flex gap-1.5 pl-[124px]">
            {COVERAGE_LINES.map((line) => (
              <span key={line} className="flex-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-400">
                {line}
              </span>
            ))}
          </div>
          <div className="mt-1.5 space-y-1.5">
            {COVERAGE_ACCOUNTS.map((account) => (
              <div key={account.name} className="flex items-center gap-1.5">
                <span className="w-[118px] flex-none truncate text-[11px] font-semibold text-slate-600">{account.name}</span>
                {account.cells.map((level, index) => (
                  <div
                    key={COVERAGE_LINES[index]}
                    title={`${account.name} · ${COVERAGE_LINES[index]}: ${level === 0 ? 'never sold' : `${level} of 3`}`}
                    className={`h-8 flex-1 rounded-[4px] transition-transform duration-150 hover:scale-[1.06] ${
                      level === 0 ? 'border border-dashed border-slate-300 bg-slate-50' : ''
                    }`}
                    style={level === 0 ? undefined : { backgroundColor: COVERAGE_RAMP[level] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
          <span className="h-3 w-3 rounded-[3px] border border-dashed border-slate-300 bg-slate-50" />
          Never sold
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
          {COVERAGE_RAMP.slice(1).map((step) => (
            <span key={step} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: step }} />
          ))}
          Less to more
        </span>
      </div>

      {/* Wrapped rather than `sr-only` on the table itself: a CSS table treats
          width:1px as a minimum and grows to fit, which pushed the page sideways. */}
      <div className="sr-only">
        <table>
        <caption>Products sold into each account</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            {COVERAGE_LINES.map((line) => <th key={line} scope="col">{line}</th>)}
          </tr>
        </thead>
        <tbody>
          {COVERAGE_ACCOUNTS.map((account) => (
            <tr key={account.name}>
              <th scope="row">{account.name}</th>
              {account.cells.map((level, index) => (
                <td key={COVERAGE_LINES[index]}>{level === 0 ? 'Never sold' : `${level} of 3`}</td>
              ))}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </figure>
  );
}
