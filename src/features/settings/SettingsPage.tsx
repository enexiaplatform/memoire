import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CloudOff } from 'lucide-react';
import { ExportTab } from './ExportTab';
import { SyncRecoveryPanel } from './SyncRecoveryPanel';
import { StoragePanel } from './StoragePanel';
import { NotificationsPanel } from './NotificationsPanel';
import { BoundariesTab } from './BoundariesTab';
import { PendingCurrencyRate } from '../../components/common/PendingCurrencyRate';
import { ProfileTab } from './ProfileTab';
import { BillingTab } from './BillingTab';
import { restartFirstRun } from '../../utils/firstRun';
import { resetTrialActivationChecklist } from '../../utils/trialActivationChecklist';
import {
  BASE_CURRENCY,
  EXCHANGE_RATES_AS_OF,
  SUPPORTED_CURRENCIES,
  getExchangeRateOverrides,
  getExchangeRateToBase,
  getReportingCurrency,
  hasExchangeRate,
  isExchangeRateOverridden,
  listSelectableCurrencies,
  setExchangeRateOverride,
  type SupportedCurrency,
} from '../../utils/money';
import { getOpeningCashBalance } from '../../utils/cashPosition';
import {
  hydrateWorkspacePreferences,
  saveFinancingRatePreference,
  saveOpeningCashBalancePreference,
  saveReportingCurrencyPreference,
  saveTargetMarginPreference,
  type PreferenceSaveResult,
} from '../../services/workspacePreferences';
import { getFinancingRatePct, getTargetMarginPct } from '../../utils/pricingAssumptions';
import { useAuth } from '../../hooks/useAuth';
import { BUSINESS_ACCOUNTING_ENABLED } from '../../config/featureFlags';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';

export function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'export' | 'boundaries'>('profile');
  const [reportingCurrency, setReportingCurrencyState] = useState(() => getReportingCurrency());
  const [currencySave, setCurrencySave] = useState<PreferenceSaveResult | null>(null);
  /** A currency chosen before it has a rate: held here until one is given. */
  const [pendingCurrency, setPendingCurrency] = useState('');
  const selectableCurrencies = useMemo(() => listSelectableCurrencies(), [pendingCurrency, reportingCurrency]);
  const [openingBalance, setOpeningBalanceState] = useState(() => {
    const stored = getOpeningCashBalance();
    return stored === null ? '' : String(stored);
  });
  const [balanceSave, setBalanceSave] = useState<PreferenceSaveResult | null>(null);
  const [targetMargin, setTargetMarginState] = useState(() => String(getTargetMarginPct()));
  const [targetMarginSave, setTargetMarginSave] = useState<PreferenceSaveResult | null>(null);
  const [financingRate, setFinancingRateState] = useState(() => String(getFinancingRatePct()));
  const [financingRateSave, setFinancingRateSave] = useState<PreferenceSaveResult | null>(null);

  // The account is the record; this browser is the cache. Reading it back on
  // open is what makes the picker show what was actually saved rather than
  // whatever this particular browser happens to remember.
  useEffect(() => {
    let active = true;
    void hydrateWorkspacePreferences(user?.id).then((preferences) => {
      if (!active) return;
      setReportingCurrencyState(preferences.reportingCurrency);
      setOpeningBalanceState(preferences.openingCashBalance === null ? '' : String(preferences.openingCashBalance));
      setTargetMarginState(String(preferences.targetMarginPct));
      setFinancingRateState(String(preferences.financingRatePct));
    });
    return () => { active = false; };
  }, [user?.id]);

  const handleCurrencyChange = async (next: string) => {
    // Reporting in a currency nothing can be converted into would read as zero
    // on every total, so the rate is asked for first and the currency is applied
    // the moment it exists. Deals and quotes are free to be in any currency -
    // an amount stated in krona is a fact; a total in krona is arithmetic.
    if (!hasExchangeRate(next)) {
      setPendingCurrency(next);
      setCurrencySave(null);
      return;
    }
    setPendingCurrency('');
    // Optimistic, because the select must not fight the cursor - but the result
    // below is what the operator is told, and it is the durable write's answer.
    setReportingCurrencyState(next as typeof reportingCurrency);
    setCurrencySave(null);
    const result = await saveReportingCurrencyPreference(next, user?.id);
    setCurrencySave(result);
    setReportingCurrencyState(getReportingCurrency());
  };

  const handleOpeningBalanceChange = async (raw: string) => {
    setBalanceSave(null);
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed.replace(/,/g, ''));
    setBalanceSave(await saveOpeningCashBalancePreference(parsed, user?.id));
  };

  const handleTargetMarginChange = async (raw: string) => {
    setTargetMarginSave(null);
    setTargetMarginSave(await saveTargetMarginPreference(raw, user?.id));
  };

  const handleFinancingRateChange = async (raw: string) => {
    setFinancingRateSave(null);
    setFinancingRateSave(await saveFinancingRatePreference(raw, user?.id));
  };

  return (
    <PageContainer width="reading">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="How this workspace reports money, what it keeps, and how to get your records out of it."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Reporting currency</p>
            <p className="mt-1 text-sm text-gray-500">
              Totals and charts are shown in this currency. Each deal keeps its own currency; amounts are converted for reporting.
            </p>
          </div>
          {/* A select sizes itself to its widest option, and the widest of these
              is "AED — UAE Dirham". Unconstrained that came to 453px, which on a
              390px phone pushed the whole document sideways - the fixed header
              and the tab bar stretched with it, so the one page where somebody
              changes their reporting currency was also the one page that
              scrolled horizontally. `min-w-0` lets it shrink; the option text is
              still complete when the menu opens. */}
          <label className="flex min-w-0 items-center gap-2">
            <span className="sr-only">Reporting currency</span>
            <select
              value={pendingCurrency || reportingCurrency}
              onChange={(event) => { void handleCurrencyChange(event.target.value); }}
              className="min-w-0 max-w-full flex-1 truncate rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            >
              {selectableCurrencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.name}{currency.hasRate ? '' : ' · needs a rate'}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pendingCurrency && (
          <PendingCurrencyRate
            currency={pendingCurrency}
            onCancel={() => setPendingCurrency('')}
            onSaved={() => { void handleCurrencyChange(pendingCurrency); }}
          />
        )}
        <SaveState result={currencySave} savedLabel={`Saved. Totals are reported in ${reportingCurrency} everywhere.`} />
      </div>

      <ExchangeRatesCard reportingCurrency={reportingCurrency} />

      {/* Opening cash balance only means something next to a profit-and-loss
          statement, and that is outside the beta proposition. Any value already
          set is kept. See src/config/featureFlags.ts. */}
      {BUSINESS_ACCOUNTING_ENABLED && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-navy">Opening cash balance</p>
              <p className="mt-1 text-sm text-gray-500">
                Optional. The cash you started with, in {reportingCurrency}. Set this and Money shows absolute cash on
                hand, not just profit.
              </p>
            </div>
            <label className="flex items-center gap-2">
              <span className="sr-only">Opening cash balance</span>
              <input
                inputMode="numeric"
                value={openingBalance}
                onChange={(event) => {
                  const next = event.target.value;
                  setOpeningBalanceState(next);
                  void handleOpeningBalanceChange(next);
                }}
                placeholder="e.g. 100000000"
                className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
          </div>
          <SaveState result={balanceSave} savedLabel="Saved to your account." />
        </div>
      )}

      {/* The two numbers every quote is priced from.
          Both used to live in this browser only, on the reasoning that a target
          margin merely annotated a report. That stopped being true when cost
          analysis moved into the quoting flow: these now decide the price a
          seller puts in front of a customer, and a figure that reads 20% on the
          laptop and 15% on the phone is not an inconsistent report - it is two
          different quotes for the same order. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-navy">Pricing assumptions</p>
        <p className="mt-1 text-sm text-gray-500">
          What every quote is priced back from. Cost Analysis on a deal uses both to work out the price that holds your
          margin after the terms you are offering.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Target margin</p>
            <p className="mt-1 text-sm text-gray-500">
              The share of the selling price you expect to keep. Every figure is graded against it.
            </p>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Target margin percent</span>
            <input
              inputMode="decimal"
              value={targetMargin}
              onChange={(event) => {
                setTargetMarginState(event.target.value);
                void handleTargetMarginChange(event.target.value);
              }}
              className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
            <span className="text-sm font-semibold text-gray-500">%</span>
          </label>
        </div>
        <SaveState result={targetMarginSave} savedLabel="Saved. Every quote is graded against this." />

        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Cost of money</p>
            <p className="mt-1 text-sm text-gray-500">
              Your overdraft or facility rate, per year. Giving a customer 60 days to pay is lending them money at this
              rate, and the suggested price includes what that costs you.
            </p>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Annual financing rate percent</span>
            <input
              inputMode="decimal"
              value={financingRate}
              onChange={(event) => {
                setFinancingRateState(event.target.value);
                void handleFinancingRateChange(event.target.value);
              }}
              className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
            <span className="text-sm font-semibold text-gray-500">% / yr</span>
          </label>
        </div>
        <SaveState result={financingRateSave} savedLabel="Saved. Credit terms are priced at this rate." />
      </div>

      <NotificationsPanel />

      <SyncRecoveryPanel />

      <StoragePanel />

      {/* The way back in. Onboarding that cannot be reopened is onboarding you
          have to get right on the one pass, and nobody does. This clears the
          answer and the dismissal, so the welcome and the corner guide both
          come back on the next visit to Today - with one caveat stated on the
          button, because `shouldOpenFirstRun` will not send a workspace that
          already has records back to the welcome. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Getting started</p>
            <p className="mt-1 text-sm text-gray-500">
              Bring back the five-step guide in the corner of the workspace. If your workspace is still empty, the
              welcome screen comes back too.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              restartFirstRun();
              resetTrialActivationChecklist();
              navigate('/app/today');
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Show the guide again
          </button>
        </div>
      </div>

      <div className="flex space-x-6 border-b border-gray-200">
        <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>
          Profile
        </TabButton>
        <TabButton active={activeTab === 'billing'} onClick={() => setActiveTab('billing')}>
          Plan & Billing
        </TabButton>
        <TabButton active={activeTab === 'boundaries'} onClick={() => setActiveTab('boundaries')}>
          Data & Privacy
        </TabButton>
        <TabButton active={activeTab === 'export'} onClick={() => setActiveTab('export')}>
          Export & Delete
        </TabButton>
      </div>

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'boundaries' && <BoundariesTab />}
      {activeTab === 'export' && <ExportTab />}
    </PageContainer>
  );
}

/**
 * What actually happened to a preference, said once, under the control that
 * changed it.
 *
 * The distinction it draws is the one the old silent writer hid: "saved" and
 * "saved in this browser only" look identical until you open Memoire somewhere
 * else, and by then the setting has already appeared to revert.
 */
/**
 * The rates every converted total on every page is produced at.
 *
 * They were hard-coded, undated and invisible. A workspace whose deals are in
 * one currency and whose reporting is in another had every figure it owns
 * silently restated at a number set by hand months earlier, with nothing on
 * screen naming it - and the arithmetic elsewhere in this product argues about
 * single points of margin, which is smaller than the drift.
 *
 * So: shown, dated, and correctable. One row per currency the workspace could
 * meet, the shipped rate as the default, and the operator's own bank rate
 * winning wherever they enter one.
 */
/**
 * The rate for a currency the product does not ship one for.
 *
 * Twenty-one currencies come with a planning rate and the rest of the world does
 * not, so an operator in Stockholm choosing SEK is asked what a krona is worth
 * before their totals are denominated in it. Refusing the choice would be worse
 * - it is their money - and applying it without a rate would be worse still:
 * every converted total would silently read zero.
 */
function ExchangeRatesCard({ reportingCurrency }: { reportingCurrency: SupportedCurrency }) {
  const [open, setOpen] = useState(false);
  const [, setVersion] = useState(0);

  const rateOf = (currency: SupportedCurrency | string) => (
    getExchangeRateToBase(currency) / getExchangeRateToBase(reportingCurrency)
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-navy">Exchange rates</p>
          <p className="mt-1 text-sm text-gray-500">
            A deal in another currency is converted at these rates before it is added to any total.
            They are planning rates set on {EXCHANGE_RATES_AS_OF}, not a live feed, and they are stored
            in this browser. Enter your own where you know better.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-navy hover:bg-gray-50"
        >
          {open ? 'Hide rates' : 'Show rates'}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {/* Shipped rates, plus any currency this operator has priced
              themselves - otherwise the krona they just gave a rate to would
              have nowhere to be corrected when their bank's rate moves. */}
          {[...new Set([...SUPPORTED_CURRENCIES as readonly string[], ...Object.keys(getExchangeRateOverrides())])]
            .filter((currency) => currency !== reportingCurrency)
            .map((currency) => (
            <label key={currency} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
              <span className="text-sm font-semibold text-navy">
                1 {currency}
                {isExchangeRateOverridden(currency) && (
                  <span className="ml-1.5 text-xs font-bold text-brand-blue">yours</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={Number(rateOf(currency).toPrecision(8))}
                  onBlur={(event) => {
                    const entered = Number(event.target.value);
                    if (!Number.isFinite(entered) || entered <= 0) return;
                    // Stored against the anchor currency, so changing the
                    // reporting currency later does not silently rescale it.
                    const toBase = entered * getExchangeRateToBase(reportingCurrency);
                    setExchangeRateOverride(currency, toBase);
                    setVersion((value) => value + 1);
                  }}
                  className="w-32 rounded-md border border-gray-300 px-2 py-1 text-right text-sm font-semibold text-navy outline-none focus:border-brand-blue"
                  aria-label={`Rate for 1 ${currency} in ${reportingCurrency}`}
                />
                <span className="w-10 text-xs font-bold text-gray-500">{reportingCurrency}</span>
              </span>
            </label>
          ))}
          <p className="sm:col-span-2 text-xs text-gray-500">
            Rates are held against {BASE_CURRENCY}, the pivot every conversion goes through. Clearing a
            field and re-entering the shipped number restores it.
          </p>
        </div>
      )}
    </div>
  );
}

function SaveState({ result, savedLabel }: { result: PreferenceSaveResult | null; savedLabel: string }) {
  if (!result) return null;

  if (!result.problem) {
    return (
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        {savedLabel}
      </p>
    );
  }

  const blocked = !result.savedLocally && !result.savedToAccount;
  return (
    <p
      className={`mt-3 inline-flex items-start gap-1.5 text-xs font-semibold ${blocked ? 'text-red-700' : 'text-amber-800'}`}
    >
      <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {result.problem}
    </p>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 pb-4 text-[15px] transition-colors ${
        active
          ? 'border-brand-blue font-semibold text-navy'
          : 'border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
