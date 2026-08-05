import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, CloudOff } from 'lucide-react';
import { ExportTab } from './ExportTab';
import { SyncRecoveryPanel } from './SyncRecoveryPanel';
import { StoragePanel } from './StoragePanel';
import { NotificationsPanel } from './NotificationsPanel';
import { BoundariesTab } from './BoundariesTab';
import { ProfileTab } from './ProfileTab';
import { REPLAY_GUIDED_WORKFLOW_EVENT } from '../onboarding/guidedWorkflow';
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES, getReportingCurrency } from '../../utils/money';
import { getOpeningCashBalance } from '../../utils/cashPosition';
import {
  hydrateWorkspacePreferences,
  saveOpeningCashBalancePreference,
  saveReportingCurrencyPreference,
  type PreferenceSaveResult,
} from '../../services/workspacePreferences';
import { useAuth } from '../../hooks/useAuth';
import { BUSINESS_ACCOUNTING_ENABLED } from '../../config/featureFlags';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'export' | 'boundaries'>('profile');
  const [reportingCurrency, setReportingCurrencyState] = useState(() => getReportingCurrency());
  const [currencySave, setCurrencySave] = useState<PreferenceSaveResult | null>(null);
  const [openingBalance, setOpeningBalanceState] = useState(() => {
    const stored = getOpeningCashBalance();
    return stored === null ? '' : String(stored);
  });
  const [balanceSave, setBalanceSave] = useState<PreferenceSaveResult | null>(null);

  // The account is the record; this browser is the cache. Reading it back on
  // open is what makes the picker show what was actually saved rather than
  // whatever this particular browser happens to remember.
  useEffect(() => {
    let active = true;
    void hydrateWorkspacePreferences(user?.id).then((preferences) => {
      if (!active) return;
      setReportingCurrencyState(preferences.reportingCurrency);
      setOpeningBalanceState(preferences.openingCashBalance === null ? '' : String(preferences.openingCashBalance));
    });
    return () => { active = false; };
  }, [user?.id]);

  const handleCurrencyChange = async (next: string) => {
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
          <label className="flex items-center gap-2">
            <span className="sr-only">Reporting currency</span>
            <select
              value={reportingCurrency}
              onChange={(event) => { void handleCurrencyChange(event.target.value); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{currency} — {CURRENCY_NAMES[currency]}</option>
              ))}
            </select>
          </label>
        </div>
        <SaveState result={currencySave} savedLabel={`Saved. Totals are reported in ${reportingCurrency} everywhere.`} />
      </div>

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

      <NotificationsPanel />

      <SyncRecoveryPanel />

      <StoragePanel />

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Guided workflow</p>
            <p className="mt-1 text-sm text-gray-500">
              Replay the guided workflow when you want to walk through a complete Memory-to-Action flow.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(REPLAY_GUIDED_WORKFLOW_EVENT))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Replay guided workflow
          </button>
        </div>
      </div>

      <div className="flex space-x-6 border-b border-gray-200">
        <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>
          Profile
        </TabButton>
        <TabButton active={activeTab === 'boundaries'} onClick={() => setActiveTab('boundaries')}>
          Data & Privacy
        </TabButton>
        <TabButton active={activeTab === 'export'} onClick={() => setActiveTab('export')}>
          Export & Delete
        </TabButton>
      </div>

      {activeTab === 'profile' && <ProfileTab />}
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
