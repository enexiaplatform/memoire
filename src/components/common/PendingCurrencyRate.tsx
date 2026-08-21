import { useState } from 'react';
import {
  BASE_CURRENCY,
  getCurrencyName,
  getExchangeRateToBase,
  setExchangeRateOverride,
} from '../../utils/money';

/**
 * The rate prompt that stands between picking a currency and reporting in it.
 *
 * Reporting in a currency nothing converts into reads as zero on every total -
 * the same trap `sumMoney` leaves when an amount cannot be priced. So the
 * picker is allowed to offer every ISO code, and this is what makes that safe:
 * choose one that does not ship with a rate and the choice is held here until a
 * rate exists.
 *
 * Shared rather than local to Settings because first run asks the same question
 * from a screen that had no answer for it. Onboarding shipped a hardcoded list
 * of twenty-one currencies while Settings and the quote form both offered all
 * of them, so an operator in Stockholm met a product that could not name their
 * currency on the first screen and could on every screen after it.
 */
export function PendingCurrencyRate({
  currency,
  onCancel,
  onSaved,
}: {
  currency: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [rate, setRate] = useState('');
  const [error, setError] = useState('');
  const anchorRate = getExchangeRateToBase(BASE_CURRENCY);

  const save = () => {
    const perUnit = Number(rate.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(perUnit) || perUnit <= 0) {
      setError('Enter how many US dollars one unit of this currency is worth.');
      return;
    }
    // Stated against USD because that is the currency this product is priced in
    // and the one an operator can look up in a second; stored against the
    // anchor, like every other rate in the table.
    const toBase = perUnit * getExchangeRateToBase('USD') / anchorRate;
    if (!setExchangeRateOverride(currency, toBase)) {
      setError('That rate could not be saved in this browser.');
      return;
    }
    setError('');
    onSaved();
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">
        {currency} — {getCurrencyName(currency)} does not ship with a rate
      </p>
      <p className="mt-1 text-sm leading-6 text-amber-900/80">
        Tell Memoire what one {currency} is worth in US dollars and every total switches to {currency}. It is a
        planning rate you can change in Settings whenever your bank's does, and nothing else about your records changes.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-amber-900">1 {currency} =</span>
          <input
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            inputMode="decimal"
            aria-label={`US dollars per ${currency}`}
            className="w-28 rounded border border-amber-300 bg-white px-2 py-1.5 text-sm"
            placeholder="0.095"
          />
          <span className="font-semibold text-amber-900">USD</span>
        </label>
        <button type="button" onClick={save} className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-white">
          Use {currency}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-amber-900 hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
