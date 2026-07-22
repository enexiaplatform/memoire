import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { QuoteRecord } from '../../services/quoteStore';
import type { ExpenseRecord } from '../../services/expenseStore';
import { buildProfitAndLoss, type PnlPeriod } from '../../utils/pnl';
import { formatCompactCurrencyAmount } from '../../utils/money';

const periodOptions: { value: PnlPeriod; label: string }[] = [
  { value: 'mtd', label: 'MTD' },
  { value: 'qtd', label: 'QTD' },
  { value: 'ytd', label: 'YTD' },
];

/**
 * The Money page's headline, as a real profit-and-loss statement rather than a
 * scatter of stat tiles. Revenue less cost gives the net line and the margin;
 * beneath it, the balance the business is carrying right now - what it is owed,
 * what it owes, and the cash. Cash-basis throughout, so nothing here is a
 * forecast dressed up as a result.
 */
export function ProfitAndLossStatement({
  quotes,
  expenses,
}: {
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
}) {
  const [period, setPeriod] = useState<PnlPeriod>('mtd');
  const pnl = useMemo(() => buildProfitAndLoss({ quotes, expenses, period }), [quotes, expenses, period]);
  const money = (amount: number) => formatCompactCurrencyAmount(amount, pnl.reportingCurrency);
  const topCategories = pnl.expenseByCategory.slice(0, 4);
  const expensesTotal = pnl.expensesBase || 1;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Profit and loss">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-blue" />
          <div>
            <h2 className="text-lg font-bold text-navy">Profit &amp; Loss</h2>
            <p className="text-xs text-gray-500">{pnl.periodLabel} · cash actually moved, in {pnl.reportingCurrency}</p>
          </div>
        </div>
        <div className="flex rounded-full border border-gray-200 p-0.5">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                period === option.value ? 'bg-brand-blue text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The statement itself. */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <StatementLine label="Revenue" hint="Collected from paid quotes" value={`+ ${money(pnl.revenueBase)}`} valueClass="text-emerald-700" />
          <StatementLine label="Operating expenses" hint="Costs settled in period" value={`− ${money(pnl.expensesBase)}`} valueClass="text-amber-700" />
          <div className="my-2 border-t border-gray-200" />
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-sm font-bold text-navy">Net profit</p>
              <p className="text-[11px] text-gray-500">
                {pnl.marginPct === null ? 'No revenue collected yet' : `${pnl.marginPct}% net margin`}
              </p>
            </div>
            <p className={`text-2xl font-bold ${pnl.netProfitBase >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {money(pnl.netProfitBase)}
            </p>
          </div>

          {topCategories.length > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Where the cost went</p>
              <div className="mt-2 space-y-1.5">
                {topCategories.map((row) => (
                  <div key={row.category} className="text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-700">{row.category}</span>
                      <span className="text-gray-500">{money(row.totalBase)}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.max((row.totalBase / expensesTotal) * 100, 3)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The balance the business is carrying right now. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <BalanceRow
            label="Accounts receivable"
            hint="Owed to you, not yet collected"
            value={money(pnl.accountsReceivableBase)}
            tone="blue"
            to="/app/quotes"
          />
          <BalanceRow
            label="Accounts payable"
            hint="You owe, not yet paid"
            value={money(pnl.accountsPayableBase)}
            tone="amber"
          />
          <BalanceRow
            label={pnl.cashOnHandBase === null ? 'Projected cash flow' : 'Cash on hand'}
            hint={pnl.cashOnHandBase === null ? 'Set opening balance in Settings' : 'Opening balance plus realized profit'}
            value={pnl.cashOnHandBase === null ? '—' : money(pnl.cashOnHandBase)}
            tone="navy"
            to={pnl.cashOnHandBase === null ? '/app/settings' : undefined}
          />
        </div>
      </div>
    </section>
  );
}

function StatementLine({ label, hint, value, valueClass }: { label: string; hint: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-400">{hint}</p>
      </div>
      <p className={`text-sm font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function BalanceRow({
  label,
  hint,
  value,
  tone,
  to,
}: {
  label: string;
  hint: string;
  value: string;
  tone: 'blue' | 'amber' | 'navy';
  to?: string;
}) {
  const valueClass = tone === 'blue' ? 'text-brand-blue' : tone === 'amber' ? 'text-amber-700' : 'text-navy';
  const body = (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className={`text-lg font-bold ${valueClass}`}>{value}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="block rounded-lg border border-gray-100 bg-gray-50/60 p-3 transition hover:border-gray-300">
        {body}
      </Link>
    );
  }
  return <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">{body}</div>;
}
