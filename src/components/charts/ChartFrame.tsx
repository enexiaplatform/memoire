import { useId, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/**
 * A chart and the table that says the same thing, behind one toggle.
 *
 * Every chart on a business surface needs a table twin, for two separate
 * reasons that happen to have one answer. The accessibility reason: a value a
 * reader can only get by hovering a mark is a value that is unreachable by
 * keyboard, by screen reader, and by anyone who cannot separate the colours.
 * The operator reason: the moment a chart surprises somebody, the next question
 * is always "what are the actual numbers" - and a dashboard that cannot answer
 * that is a dashboard they stop believing.
 *
 * It is deliberately not a modal or a separate page. Tableau's "View Data" is a
 * sheet you have to go and find; here the numbers are one click away and land in
 * the same card, so checking them costs nothing and nobody loses their place.
 */
export type ChartTableColumn = {
  key: string;
  label: string;
  /** Right-aligned by default for numbers; pass false for text columns. */
  numeric?: boolean;
};

export function ChartFrame({
  title,
  subtitle,
  columns,
  rows,
  caption,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Column definitions for the table twin. */
  columns: ChartTableColumn[];
  /** Pre-formatted cell text, keyed by column. Formatting belongs to the caller
   *  so the table shows exactly the figures the chart's labels show. */
  rows: Record<string, string>[];
  caption?: ReactNode;
  children: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const panelId = useId();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-navy">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {rows.length > 0 && (
          <div className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5" role="group" aria-label={`${title} view`}>
            <ViewButton
              active={view === 'chart'}
              onClick={() => setView('chart')}
              label="Chart"
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              controls={panelId}
            />
            <ViewButton
              active={view === 'table'}
              onClick={() => setView('table')}
              label="Table"
              icon={<Table2 className="h-3.5 w-3.5" />}
              controls={panelId}
            />
          </div>
        )}
      </div>

      <div id={panelId} className="mt-4">
        {view === 'chart' ? children : <ChartTable columns={columns} rows={rows} />}
      </div>

      {caption && <div className="mt-3">{caption}</div>}
    </section>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  icon,
  controls,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-controls={controls}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${
        active ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ChartTable({ columns, rows }: { columns: ChartTableColumn[]; rows: Record<string, string>[] }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-200">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`py-2 pr-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 ${
                  column.numeric === false ? '' : 'text-right'
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[columns[0].key]}-${index}`} className="border-b border-gray-100 last:border-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-1.5 pr-3 ${
                    column.numeric === false
                      ? 'font-semibold text-gray-700'
                      : // tabular-nums only where digits stack, which is exactly here.
                        'text-right font-semibold tabular-nums text-gray-800'
                  }`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
