import { Target } from 'lucide-react';
import {
  FORECAST_CALIBRATION_MIN_SAMPLE,
  formatWinRate,
  type ProbabilityCalibration,
} from '../../utils/forecastCalibration';
import { CalibrationGapChart, type CalibrationGapRow } from '../../components/charts/CalibrationGapChart';

const VERDICT_WORD: Record<CalibrationGapRow['verdictTone'], string> = {
  optimistic: 'Optimistic',
  pessimistic: 'Under-called',
  calibrated: 'Holding up',
  unrated: 'Not enough yet',
};

/**
 * Were your numbers right?
 *
 * The evidence-category panel next to this one asks whether a *label* holds up.
 * This asks the blunter question a CRM never asks, because a CRM has no reason
 * to hold the seller to what they said: when you wrote 70% on a deal, how often
 * did you actually win it.
 *
 * It is deliberately the smallest possible view. Four bands, one claim each,
 * and a sentence naming the worst gap - which is the only part most people will
 * read, and the only part that changes what they do on Monday.
 */
export function ProbabilityCalibrationPanel({ calibration }: { calibration: ProbabilityCalibration }) {
  const rows: CalibrationGapRow[] = calibration.rows
    .filter((row) => row.closed > 0)
    .map((row) => ({
      id: row.bandId,
      label: row.label,
      claimed: row.claimed,
      actual: row.sufficientSample && row.actualWinRate !== null ? row.actualWinRate * 100 : null,
      verdict: VERDICT_WORD[row.verdict],
      verdictTone: row.verdict,
      detail: row.sufficientSample
        ? `${row.won} of ${row.closed} won`
        : `${row.closed} closed - needs ${FORECAST_CALIBRATION_MIN_SAMPLE} to rate`,
    }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-brand-blue">
          <Target className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-navy">Were your numbers right?</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">{calibration.headline}</p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-4">
          <CalibrationGapChart
            rows={rows}
            ariaLabel="Declared probability against the win rate actually achieved, by probability band"
          />
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-gray-500">
        Read from the probability each deal carried when it closed, not the 100% or 0% it ended on.
        Deals closed before probabilities were recorded are not counted, which is why this can stay
        empty for a while.
      </p>

      {/* The chart is a reading of the same numbers, so the numbers stay
          available as text for anyone the chart does not serve. */}
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-bold text-brand-blue underline">
          Show as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-3 font-bold">Band</th>
                <th className="py-1.5 pr-3 font-bold">You said</th>
                <th className="py-1.5 pr-3 font-bold">Actually won</th>
                <th className="py-1.5 pr-3 font-bold">Closed</th>
                <th className="py-1.5 font-bold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {calibration.rows.map((row) => (
                <tr key={row.bandId} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-semibold text-gray-700">{row.label}</td>
                  <td className="py-1.5 pr-3 text-gray-600">{row.claimed}%</td>
                  <td className="py-1.5 pr-3 font-bold text-navy">
                    {row.sufficientSample ? formatWinRate(row.actualWinRate) : '-'}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600">{row.won} of {row.closed}</td>
                  <td className="py-1.5 text-gray-600">{VERDICT_WORD[row.verdict]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
