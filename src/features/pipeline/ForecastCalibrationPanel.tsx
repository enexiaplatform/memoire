import { Scale } from 'lucide-react';
import {
  FORECAST_CALIBRATION_MIN_SAMPLE,
  formatWinRate,
  type ForecastCalibration,
  type ForecastCalibrationRow,
} from '../../utils/forecastCalibration';
import { formatBaseCurrencyAmount } from '../../utils/money';

export function ForecastCalibrationPanel({ calibration }: { calibration: ForecastCalibration }) {
  if (calibration.totalClosed === 0) return null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-brand-blue">
          <Scale className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-navy">Personal forecast calibration</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">{calibration.headline}</p>
          <p className="mt-1 text-xs text-gray-500">
            Win rates come from your own {calibration.totalClosed} closed {calibration.totalClosed === 1 ? 'outcome' : 'outcomes'}. This is your history, not a prediction.
          </p>
        </div>
      </div>

      {calibration.warnings.length > 1 && (
        <div className="mt-3 space-y-2">
          {calibration.warnings.slice(1).map((warning) => (
            <p key={warning.id} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
              {warning.message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Evidence label</th>
              <th className="py-2 pr-3">Closed</th>
              <th className="py-2 pr-3">Won / Lost / Stalled</th>
              <th className="py-2 pr-3">Your win rate</th>
              <th className="py-2 pr-3">Active deals</th>
              <th className="py-2">Calibrated value</th>
            </tr>
          </thead>
          <tbody>
            {calibration.rows.map((row) => (
              <CalibrationRow key={row.category} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-5 text-gray-500">
        {calibration.calibratedPipelineBase !== null
          ? `Calibrated expected value across rated categories: ${formatBaseCurrencyAmount(calibration.calibratedPipelineBase, true)}.`
          : `No category has reached the minimum of ${FORECAST_CALIBRATION_MIN_SAMPLE} closed outcomes yet.`}
        {calibration.unratedActiveDeals > 0
          ? ` ${calibration.unratedActiveDeals} active ${calibration.unratedActiveDeals === 1 ? 'deal sits' : 'deals sit'} in unrated categories and ${calibration.unratedActiveDeals === 1 ? 'is' : 'are'} excluded.`
          : ''}
      </p>
    </section>
  );
}

function CalibrationRow({ row }: { row: ForecastCalibrationRow }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2.5 pr-3 font-semibold text-gray-900">{row.category}</td>
      <td className="py-2.5 pr-3 text-gray-700">{row.closed}</td>
      <td className="py-2.5 pr-3 text-gray-700">
        {row.closed > 0 ? `${row.won} / ${row.lost} / ${row.stalled}` : '-'}
      </td>
      <td className="py-2.5 pr-3">
        {row.sufficientSample && row.winRate !== null ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${winRateTone(row.winRate)}`}>
            {formatWinRate(row.winRate)}
          </span>
        ) : (
          <span className="text-xs font-semibold text-gray-400">
            {row.closed > 0 ? `Unrated (${row.closed} of ${FORECAST_CALIBRATION_MIN_SAMPLE})` : 'No history'}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-gray-700">
        {row.activeDeals > 0 ? `${row.activeDeals} (${formatBaseCurrencyAmount(row.activePipelineBase, true)})` : '-'}
      </td>
      <td className="py-2.5 text-gray-700">
        {row.calibratedValueBase !== null ? formatBaseCurrencyAmount(row.calibratedValueBase, true) : '-'}
      </td>
    </tr>
  );
}

function winRateTone(winRate: number) {
  if (winRate >= 0.6) return 'bg-emerald-50 text-emerald-700';
  if (winRate >= 0.35) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}
