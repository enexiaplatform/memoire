import { useState } from 'react';
import type { ReactNode } from 'react';
import { ExportTab } from './ExportTab';
import { SyncRecoveryPanel } from './SyncRecoveryPanel';
import { StoragePanel } from './StoragePanel';
import { NotificationsPanel } from './NotificationsPanel';
import { BoundariesTab } from './BoundariesTab';
import { ProfileTab } from './ProfileTab';
import { REPLAY_GUIDED_WORKFLOW_EVENT } from '../onboarding/guidedWorkflow';
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES, getReportingCurrency, setReportingCurrency } from '../../utils/money';
import { getOpeningCashBalance, setOpeningCashBalance } from '../../utils/cashPosition';
import { BUSINESS_ACCOUNTING_ENABLED } from '../../config/featureFlags';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'export' | 'boundaries'>('profile');
  const [reportingCurrency, setReportingCurrencyState] = useState(() => getReportingCurrency());
  const [openingBalance, setOpeningBalanceState] = useState(() => {
    const stored = getOpeningCashBalance();
    return stored === null ? '' : String(stored);
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Workspace</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Settings</h1>
      </header>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
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
              onChange={(event) => {
                setReportingCurrency(event.target.value);
                setReportingCurrencyState(getReportingCurrency());
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{currency} — {CURRENCY_NAMES[currency]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Opening cash balance only means something next to a profit-and-loss
          statement, and that is outside the beta proposition. Any value already
          set is kept. See src/config/featureFlags.ts. */}
      {BUSINESS_ACCOUNTING_ENABLED && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
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
                  setOpeningCashBalance(next.trim() === '' ? null : Number(next.replace(/,/g, '')));
                }}
                placeholder="e.g. 100000000"
                className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
          </div>
        </div>
      )}

      <NotificationsPanel />

      <SyncRecoveryPanel />

      <StoragePanel />

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
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

      <div className="mb-8 flex space-x-6 border-b border-gray-200">
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
    </div>
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
