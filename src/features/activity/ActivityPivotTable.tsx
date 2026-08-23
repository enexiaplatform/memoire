import { Table2 } from 'lucide-react';
import {
  activityDimensions,
  dimensionLabel,
  type ActivityDimension,
  type ActivityPivot,
} from '../../utils/activityPivot.ts';

/**
 * The pivot, rendered as a heat-shaded cross-tab.
 *
 * Two selects and a table, and it replaces about ten charts nobody would have
 * scrolled through. The shading matters as much as the numbers: an operator
 * reads the dark corner of a grid instantly and reads a column of integers
 * never, and the dark corner is the answer to "where did the month actually
 * go".
 *
 * Every cell is a button. A pivot you can only look at is a report; a pivot that
 * filters the ledger underneath it is a way of asking questions.
 */
export function ActivityPivotTable({
  pivot,
  onChangeRows,
  onChangeColumns,
  onSelectCell,
  selected,
}: {
  pivot: ActivityPivot;
  onChangeRows: (dimension: ActivityDimension) => void;
  onChangeColumns: (dimension: ActivityDimension) => void;
  onSelectCell?: (cell: { rowKey: string; columnKey: string }) => void;
  selected?: { rowKey: string; columnKey: string } | null;
}) {
  const rowMeta = activityDimensions.find((dimension) => dimension.id === pivot.rowDimension);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Pivot</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {dimensionLabel(pivot.rowDimension)} down, {dimensionLabel(pivot.columnDimension)} across.
            {rowMeta ? ` ${rowMeta.hint}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <DimensionSelect label="Rows" value={pivot.rowDimension} onChange={onChangeRows} />
          <DimensionSelect label="Columns" value={pivot.columnDimension} onChange={onChangeColumns} />
        </div>
      </div>

      {pivot.grandTotal === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          Nothing to cross-tabulate in this period yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-gray-200 bg-white pb-2 pr-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  {dimensionLabel(pivot.rowDimension)}
                </th>
                {pivot.columns.map((column) => (
                  <th
                    key={column.key}
                    className="border-b border-gray-200 px-1.5 pb-2 text-center text-[11px] font-bold text-navy"
                    title={column.label}
                  >
                    <span className="block max-w-[86px] truncate">{column.label}</span>
                  </th>
                ))}
                <th className="border-b border-gray-200 pb-2 pl-3 text-right text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map((row) => (
                <tr key={row.key} className="group">
                  <th className="sticky left-0 z-10 max-w-[clamp(190px,14vw,360px)] border-b border-gray-100 bg-white py-1.5 pr-3 text-left align-middle font-semibold text-gray-800 group-hover:bg-blue-50/40">
                    <span className="block truncate" title={row.label}>{row.label}</span>
                    {row.note && <span className="block text-[10px] font-medium text-gray-400">{row.note}</span>}
                  </th>
                  {row.cells.map((cell, index) => {
                    const column = pivot.columns[index];
                    const isSelected = selected?.rowKey === row.key && selected?.columnKey === column.key;
                    return (
                      <td key={column.key} className="border-b border-gray-100 p-0.5 text-center">
                        <button
                          type="button"
                          disabled={cell.count === 0 || !onSelectCell}
                          onClick={() => onSelectCell?.({ rowKey: row.key, columnKey: column.key })}
                          title={`${row.label} × ${column.label}: ${cell.count}${
                            cell.count > 0 ? ` (${Math.round(cell.rowShare * 100)}% of ${row.label})` : ''
                          }`}
                          className={`flex h-8 w-full items-center justify-center rounded text-xs font-bold transition ${
                            isSelected ? 'ring-2 ring-navy ring-offset-1' : ''
                          } ${cell.count === 0 ? 'cursor-default text-gray-200' : 'hover:opacity-80'}`}
                          style={cell.count === 0 ? undefined : cellStyle(cell.count, pivot.maxCell)}
                        >
                          {cell.count === 0 ? '·' : cell.count}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-gray-100 pl-3 text-right font-bold text-navy">{row.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="sticky left-0 z-10 bg-white pt-2 pr-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  Total
                </th>
                {pivot.columnTotals.map((total, index) => (
                  <td key={pivot.columns[index].key} className="pt-2 text-center text-xs font-bold text-gray-600">
                    {total}
                  </td>
                ))}
                <td className="pt-2 pl-3 text-right text-sm font-black text-navy">{pivot.grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {pivot.truncatedRows > 0 && (
        <p className="mt-2 text-[11px] text-gray-400">
          The {pivot.truncatedRows} smallest {dimensionLabel(pivot.rowDimension).toLowerCase()} values are folded into the last row -
          a hundred-row grid answers nothing.
        </p>
      )}
    </section>
  );
}

function DimensionSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ActivityDimension;
  onChange: (dimension: ActivityDimension) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ActivityDimension)}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-navy focus:border-brand-blue focus:outline-none"
      >
        {activityDimensions.map((dimension) => (
          <option key={dimension.id} value={dimension.id}>{dimension.label}</option>
        ))}
      </select>
    </label>
  );
}

function cellStyle(count: number, max: number) {
  const ratio = max === 0 ? 0 : count / max;
  // Text flips to white only once the fill is dark enough to need it - a
  // threshold, not a gradient, so nothing lands on unreadable mid-blue.
  return {
    backgroundColor: `rgba(25, 118, 210, ${0.12 + ratio * 0.78})`,
    color: ratio > 0.55 ? '#ffffff' : '#0B2545',
  };
}
