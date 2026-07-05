import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExportTab } from './ExportTab';
import { BoundariesTab } from './BoundariesTab';
import { REPLAY_GUIDED_WORKFLOW_EVENT } from '../onboarding/guidedWorkflow';
import { buildSalesOperatingSetupProgress, loadSalesOperatingSetupState } from '../../utils/salesOperatingSetup';
import { SUPPORTED_CURRENCIES, getReportingCurrency, setReportingCurrency } from '../../utils/money';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'export' | 'boundaries'>('boundaries');
  const [reportingCurrency, setReportingCurrencyState] = useState(() => getReportingCurrency());
  const salesOperatingSetupProgress = buildSalesOperatingSetupProgress(loadSalesOperatingSetupState());

  return (
    <div className="w-full max-w-4xl">
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
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

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

      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Sales operating setup</p>
            <p className="mt-1 text-sm text-blue-900">
              {salesOperatingSetupProgress.percent}% ready across target, GTM, RTM, sales cycle, and daily activity log.
            </p>
          </div>
          <Link
            to="/app/onboarding/sales-operating-setup"
            className="inline-flex justify-center rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white hover:bg-navy/90"
          >
            Open setup
          </Link>
        </div>
      </div>

      <div className="mb-8 flex space-x-6 border-b border-gray-200">
        <TabButton active={activeTab === 'boundaries'} onClick={() => setActiveTab('boundaries')}>
          Data & Privacy
        </TabButton>
        <TabButton active={activeTab === 'export'} onClick={() => setActiveTab('export')}>
          Export & Delete
        </TabButton>
      </div>

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
