import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, ExternalLink } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import { updateQuote, type QuoteRecord } from '../../services/quoteStore';
import { loadOrderCostsForWorkspace, saveOrderCost } from '../../services/orderCostStore';
import { buildCreditScenarios, buildQuotePricing } from '../../utils/quotePricing';
import { getFinancingRatePct, getTargetMarginPct } from '../../utils/pricingAssumptions';
import { describeInstallment, parsePaymentTerm, type ParsedPaymentTerm } from '../../utils/paymentTerms';
import {
  SUPPORTED_CURRENCIES,
  convertMoney,
  formatBaseCurrencyAmount,
  formatCompactBaseAmount,
  formatCurrencyAmount,
  getReportingCurrency,
} from '../../utils/money';

/**
 * Pricing, at the moment the price is being decided.
 *
 * Cost analysis shipped pointed backwards: it graded orders that were already
 * signed. That produced true sentences nobody could act on - the price was the
 * price, and the only thing left to do with "you kept 11%" was regret it. The
 * founder's correction was that this belongs in the quoting flow, and this panel
 * is where it lands: on the deal, once it reaches the stage where a number is
 * about to go out.
 *
 * The thing it adds that a margin report never could is the cost of the terms.
 * Sixty days of credit on a 12% facility is roughly two points of margin, and a
 * seller who concedes "net 60 instead of net 30" has discounted without ever
 * seeing a discount. So the panel prices the terms alongside the goods, and
 * shows what each credit period would have to be sold at.
 *
 * It writes to the same one-cost-per-order record that Cost Analysis reads, so
 * a purchase price entered here while quoting is the same figure that grades the
 * order after it lands. Entering it twice was the alternative, and nobody does.
 */

export function QuotePricingPanel({
  opportunity,
  quotes,
  dataUserId,
  sampleDataActive,
}: {
  opportunity: CrmLiteOpportunity;
  quotes: QuoteRecord[];
  dataUserId?: string;
  sampleDataActive: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({
    amount: '',
    currency: opportunity.currency || 'VND',
    freightAmount: '',
    dutyAmount: '',
    otherAmount: '',
    extrasCurrency: opportunity.currency || 'VND',
    supplier: '',
  });
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadOrderCostsForWorkspace(dataUserId, sampleDataActive).then((loadedRecords) => {
      if (cancelled) return;
      setLoaded(true);
      const existing = loadedRecords.find((record) => record.opportunityId === opportunity.id);
      if (existing) {
        setDraft({
          amount: existing.amount === null ? '' : String(existing.amount),
          currency: existing.currency,
          freightAmount: existing.freightAmount === null ? '' : String(existing.freightAmount),
          dutyAmount: existing.dutyAmount === null ? '' : String(existing.dutyAmount),
          otherAmount: existing.otherAmount === null ? '' : String(existing.otherAmount),
          extrasCurrency: existing.extrasCurrency,
          supplier: existing.supplier,
        });
      }
    });
    return () => { cancelled = true; };
  }, [dataUserId, opportunity.id, sampleDataActive]);

  const targetPct = getTargetMarginPct();
  const financingRatePct = getFinancingRatePct();

  // The terms on the freshest quote, falling back to nothing. A deal with no
  // quote yet is priced on whatever the operator is about to offer, so the
  // field below is editable rather than read-only.
  const freshestQuote = useMemo(() => (
    [...quotes].sort((left, right) => (right.quoteDate || '').localeCompare(left.quoteDate || ''))[0] || null
  ), [quotes]);
  const quotedTerm = freshestQuote?.paymentTerm || '';
  const [term, setTerm] = useState(quotedTerm);
  useEffect(() => { setTerm(quotedTerm); }, [quotedTerm]);
  const [termSaved, setTermSaved] = useState('');

  const [deliveryLagDays, setDeliveryLagDays] = useState('0');

  const parsedTerm = useMemo(() => parsePaymentTerm(term), [term]);

  const proposedPriceBase = useMemo(() => {
    if (typeof opportunity.estimatedValue !== 'number') return null;
    return convertMoney(opportunity.estimatedValue, opportunity.currency);
  }, [opportunity.currency, opportunity.estimatedValue]);

  const pricing = useMemo(() => buildQuotePricing({
    cost: {
      goodsAmount: numberOrNull(draft.amount),
      goodsCurrency: draft.currency,
      freightAmount: numberOrNull(draft.freightAmount),
      dutyAmount: numberOrNull(draft.dutyAmount),
      otherAmount: numberOrNull(draft.otherAmount),
      extrasCurrency: draft.extrasCurrency,
    },
    installments: parsedTerm.installments,
    deliveryLagDays: Number(deliveryLagDays) || 0,
    targetPct,
    financingRatePct,
    proposedPriceBase,
  }), [draft, parsedTerm, deliveryLagDays, targetPct, financingRatePct, proposedPriceBase]);

  const scenarios = useMemo(() => buildCreditScenarios({
    landedCostBase: pricing.landedCostBase,
    targetPct,
    financingRatePct,
  }), [pricing.landedCostBase, targetPct, financingRatePct]);

  const persist = () => {
    saveOrderCost({
      opportunityId: opportunity.id,
      amount: numberOrNull(draft.amount),
      currency: draft.currency,
      freightAmount: numberOrNull(draft.freightAmount),
      dutyAmount: numberOrNull(draft.dutyAmount),
      otherAmount: numberOrNull(draft.otherAmount),
      extrasCurrency: draft.extrasCurrency,
      supplier: draft.supplier,
      // Saved with the cost, not only onto a quote. The price on this card is
      // calculated from these terms, and before this they lived in component
      // state: type them, watch them parse, press save, lose them - while the
      // order book went on reporting "No payment term".
      paymentTerm: term,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    });
    setSaved(term.trim()
      ? 'Purchase cost and terms saved. The order book and Cash Collection read them from here until a quote replaces them.'
      : 'Purchase cost saved. Cost Analysis reads the same figure once this order lands.');
    window.setTimeout(() => setSaved(''), 4000);
  };

  if (!loaded) return null;

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
          <div>
            <h3 className="text-sm font-bold text-navy">Cost analysis — what to quote</h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-gray-600">
              What this order costs you to buy and to finance, and the price that keeps your target margin after both.
              Nothing here changes the deal value — it tells you what the value should be.
            </p>
          </div>
        </div>
        <Link
          to="/app/cost-analysis"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
        >
          Full cost analysis
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField label="Goods cost" value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} />
        <CurrencyField label="Bought in" value={draft.currency} onChange={(value) => setDraft({ ...draft, currency: value })} />
        <TextField label="Supplier" value={draft.supplier} onChange={(value) => setDraft({ ...draft, supplier: value })} />
        <NumberField label="Freight" value={draft.freightAmount} onChange={(value) => setDraft({ ...draft, freightAmount: value })} />
        <NumberField label="Duty" value={draft.dutyAmount} onChange={(value) => setDraft({ ...draft, dutyAmount: value })} />
        <NumberField label="Other" value={draft.otherAmount} onChange={(value) => setDraft({ ...draft, otherAmount: value })} />
        {/* Extras keep their own currency because that is the ordinary shape of
            an import: the principal invoices in USD and the forwarder, the
            broker and the engineer all invoice in dong. */}
        <CurrencyField
          label="Extras paid in"
          value={draft.extrasCurrency}
          onChange={(value) => setDraft({ ...draft, extrasCurrency: value })}
        />
        <TextField
          label="Payment terms you will offer"
          value={term}
          onChange={(value) => { setTerm(value); setTermSaved(''); }}
          placeholder="30% deposit, 70% net 45"
        />
        <NumberField
          label="Days until delivery"
          value={deliveryLagDays}
          onChange={setDeliveryLagDays}
        />
      </div>

      {/* What the sentence was understood to mean, in the same words a
          collection call would use.
          Terms are typed as free text on purpose - that is how a distributor
          writes them and how they say them on the phone - but free text with no
          echo leaves the operator asking, reasonably, whether the product
          understood any of it. It reads the sentence into dated slices, and
          those slices are what Cash Collection chases and what the financing
          cost above is calculated from, so showing them is not decoration: it is
          the operator's only chance to catch a misread before it becomes a due
          date. */}
      <PaymentTermReadout
        term={term}
        parsed={parsedTerm}
        quote={freshestQuote}
        saved={termSaved}
        onSaveToQuote={() => {
          if (!freshestQuote) return;
          const { id, createdAt, updatedAt, ...input } = freshestQuote;
          void id; void createdAt; void updatedAt;
          updateQuote(freshestQuote, { ...input, paymentTerm: term });
          setTermSaved('Saved on the quote. Cash Collection reads these dates from here.');
        }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={persist}
          className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
        >
          Save purchase cost
        </button>
        {saved && <span className="text-xs font-semibold text-emerald-700">{saved}</span>}
      </div>

      {!pricing.hasCost ? (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-gray-500">
          Enter what this costs you to buy and Memoire will work out the price that holds your {targetPct}% target —
          including what the payment terms cost you to carry.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Landed cost" value={formatCompactBaseAmount(pricing.landedCostBase)} detail="Goods, freight, duty, other" />
            <Figure
              label="Cost of credit"
              value={formatCompactBaseAmount(pricing.financingCostBase)}
              detail={pricing.creditDays > 0
                ? `${pricing.creditDays} days out at ${pricing.financingRatePct}%`
                : 'Paid up front — nothing to carry'}
              tone={pricing.financingCostBase > 0 ? 'amber' : 'default'}
            />
            <Figure
              label={`Quote at least`}
              value={formatCompactBaseAmount(pricing.suggestedPriceBase)}
              detail={`Holds ${targetPct}% after financing`}
              tone="blue"
            />
            {/* Says which of the two per-day numbers this is. The tile beside
                it reports interest over the whole credit period, and a reader
                who divides that by the days gets a different figure - correctly,
                because this one is grossed up to hold the margin. Unlabelled,
                the pair reads as an arithmetic error. */}
            <Figure
              label="One more day adds"
              value={formatCompactBaseAmount(pricing.costPerCreditDayBase)}
              detail={`To the price, to hold ${targetPct}% · interest alone ${formatCompactBaseAmount(pricing.interestPerCreditDayBase)}/day`}
            />
          </div>

          {pricing.proposedPriceBase !== null && (
            <div
              className={`mt-3 rounded-lg px-3 py-2.5 text-xs font-semibold leading-5 ${
                pricing.meetsTarget ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
              }`}
            >
              {/* Two margins, because the gap between them is the argument. The
                  first is what the deal looks like on the invoice; the second is
                  what is left after waiting to be paid. */}
              At the deal value of {formatBaseCurrencyAmount(pricing.proposedPriceBase)}: {pricing.grossMarginPct}% on
              landed cost, {pricing.netMarginPct}% after {pricing.creditDays} days of credit
              {pricing.financingDragPct
                ? ` (the terms cost you ${pricing.financingDragPct} ${pricing.financingDragPct === 1 ? 'point' : 'points'})`
                : ''}.
              {pricing.meetsTarget
                ? ` Clears the ${targetPct}% target — you have ${formatBaseCurrencyAmount(pricing.headroomBase)} of room.`
                : ` ${formatBaseCurrencyAmount(pricing.shortfallBase)} under the ${targetPct}% target — raise the price, or shorten the terms.`}
            </div>
          )}

          <details className="mt-4 rounded-lg border border-blue-100 bg-white p-3">
            <summary className="cursor-pointer text-xs font-bold text-navy">
              What each set of terms would have to sell for
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-xs">
                <thead className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="pb-1.5 pr-3">Terms</th>
                    <th className="pb-1.5 pr-3 text-right">Costs to carry</th>
                    <th className="pb-1.5 pr-3 text-right">Quote at</th>
                    <th className="pb-1.5 text-right">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scenarios.map((scenario) => (
                    <tr key={scenario.creditDays}>
                      <td className="py-1.5 pr-3 font-semibold text-navy">{scenario.label}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{formatCompactBaseAmount(scenario.financingCostBase)}</td>
                      {/* Full figures, not compact. This column exists to show
                          that the price moves with the terms, and at a couple of
                          billion dong every row rounds to the same "2.2B" - a
                          table whose whole argument is a difference cannot
                          render that difference as identical. */}
                      <td className="py-1.5 pr-3 text-right font-bold text-navy">
                        {formatCurrencyAmount(scenario.suggestedPriceBase, getReportingCurrency())}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {scenario.premiumBase > 0 ? `+${scenario.premiumPct}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-gray-500">
              At your {financingRatePct}% cost of money. Change it in Settings if your facility charges something else.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

/**
 * What Memoire read out of the terms sentence, and where those dates end up.
 *
 * Three states, and the difference between them is the whole point: `stated`
 * means the schedule came from the words, `partial` that the rest was completed
 * to 100%, `assumed` that nothing usable was found and one payment on delivery
 * is standing in. A due date the product inferred and a due date the customer
 * agreed to are different kinds of fact.
 */
function PaymentTermReadout({
  term,
  parsed,
  quote,
  saved,
  onSaveToQuote,
}: {
  term: string;
  parsed: ParsedPaymentTerm;
  quote: QuoteRecord | null;
  saved: string;
  onSaveToQuote: () => void;
}) {
  const tone = parsed.confidence === 'assumed'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : parsed.confidence === 'partial'
      ? 'border-blue-100 bg-white text-gray-700'
      : 'border-emerald-100 bg-emerald-50/60 text-emerald-900';

  const unsaved = term.trim() !== (quote?.paymentTerm || '').trim();

  return (
    <div className={`mt-3 rounded-lg border p-3 ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide">Memoire read these terms as</p>
      {term.trim() === '' ? (
        <p className="mt-1 text-xs leading-5">
          Nothing typed yet. Write them the way you say them — “30% deposit, 70% net 45”, “50/50”, “Net 30”, “COD” —
          and the schedule appears here.
        </p>
      ) : (
        <>
          <ul className="mt-1.5 space-y-0.5 text-xs font-semibold leading-5">
            {parsed.installments.map((installment) => (
              <li key={installment.id}>• {installment.label} — {describeInstallment(installment)}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-5">
            {parsed.confidence === 'stated'
              ? 'Read straight from your words.'
              : parsed.confidence === 'partial'
                ? 'Part of this was read from your words; the remainder was completed to 100% on delivery.'
                : `Nothing usable was found in “${term}”, so one payment on delivery is standing in. Try a shape like “30% deposit, 70% net 45”.`}
            {' '}These are the dates Cash Collection chases and the financing cost above is priced from.
          </p>
        </>
      )}

      {/* The field above was a what-if: it priced the deal and then forgot the
          terms, so an operator who typed them here believed they were recorded
          and nothing downstream ever saw them. Terms live on the quote. */}
      {quote ? (
        unsaved ? (
          <button
            type="button"
            onClick={onSaveToQuote}
            className="mt-2 rounded-full border border-current px-3 py-1.5 text-[11px] font-bold"
          >
            Save these terms onto the quote
          </button>
        ) : (
          <p className="mt-2 text-[11px] font-semibold">These are the terms recorded on the quote.</p>
        )
      ) : (
        // There is no "Money" section to send anyone to - the copy named a part
        // of the interface that does not exist - and the terms are no longer a
        // what-if either: Save purchase cost keeps them, and the order book and
        // Cash Collection read them until a quote replaces them.
        <p className="mt-2 text-[11px] leading-5">
          No quote on this deal yet. Save purchase cost keeps these terms on the deal, and the order book and
          Cash Collection use them until a quote carries its own.
        </p>
      )}
      {saved && <p className="mt-1.5 text-[11px] font-bold">{saved}</p>}
    </div>
  );
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Figure({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'blue' | 'amber';
}) {
  const color = tone === 'blue' ? 'text-brand-blue' : tone === 'amber' ? 'text-amber-700' : 'text-navy';
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-gray-500">{detail}</p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col text-xs font-semibold text-gray-600">
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        placeholder="0"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col text-xs font-semibold text-gray-600">
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </label>
  );
}

function CurrencyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col text-xs font-semibold text-gray-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
      >
        {SUPPORTED_CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>{currency}</option>
        ))}
      </select>
    </label>
  );
}
