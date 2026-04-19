import { useState } from 'react';
import { BillingPage } from '../billing/BillingPage';
import { ExportTab } from './ExportTab';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'billing' | 'export'>('billing');

  return (
    <div className="max-w-4xl">
      <div className="flex space-x-6 border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab('billing')}
          className={`pb-4 text-[15px] border-b-[2px] transition-colors ${
            activeTab === 'billing'
              ? 'border-brand-blue text-navy font-semibold font-display'
              : 'border-transparent text-gray-500 hover:text-[#334155] font-medium font-body hover:border-gray-300'
          }`}
        >
          Billing & Subscription
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`pb-4 text-[15px] border-b-[2px] transition-colors ${
            activeTab === 'export'
              ? 'border-brand-blue text-navy font-semibold font-display'
              : 'border-transparent text-gray-500 hover:text-[#334155] font-medium font-body hover:border-gray-300'
          }`}
        >
          Export Data
        </button>
      </div>

      <div>
        {activeTab === 'billing' && <BillingPage />}
        {activeTab === 'export' && <ExportTab />}
      </div>
    </div>
  );
}
