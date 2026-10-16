import type { CommercialTarget } from '../services/commercialKernel/targetStore.ts';
import { FORECAST_QUARTERS, type ForecastQuarter } from '../domain/commercialKernel/forecast.ts';
import { convertMoney, type SupportedCurrency } from './money.ts';

export function targetEditorValues(targets: CommercialTarget[], currency: SupportedCurrency) {
  return Object.fromEntries(FORECAST_QUARTERS.map((quarter) => {
    const target = targets.find((item) => item.period === quarter);
    const amount = target ? convertMoney(target.amount, target.currency, currency) : null;
    return [quarter, amount === null ? '' : String(amount)];
  })) as Record<ForecastQuarter, string>;
}

/** Unchanged fields preserve the original amount, unit and revision history. */
export function targetEditorChanges(
  values: Record<ForecastQuarter, string>,
  initial: Record<ForecastQuarter, string>,
) {
  const changes: { period: ForecastQuarter; amount: number }[] = [];
  for (const period of FORECAST_QUARTERS) {
    const raw = values[period].trim();
    if (!raw) continue;
    const amount = Number(raw.replace(/[,\s]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      return { changes: [], error: `${period} target needs a number that is zero or more.` };
    }
    if (initial[period] !== '' && amount === Number(initial[period])) continue;
    changes.push({ period, amount });
  }
  return { changes, error: '' };
}
