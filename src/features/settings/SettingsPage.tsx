import { useState } from 'react';
import { BillingPage } from '../billing/BillingPage';
import { Card } from '../../components/ui/Card';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'billing' | 'export'>('billing');

  return (
    <div className="max-w-4xl">
      <div className="flex space-x-6 border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab('billing')}
          className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'billing'
              ? 'border-memoire-900 text-memoire-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Billing & Subscription
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'export'
              ? 'border-memoire-900 text-memoire-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Export Data
        </button>
      </div>

      <div>
        {activeTab === 'billing' && <BillingPage />}
        {activeTab === 'export' && (
          <Card>
            <div className="p-12 text-center">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Export coming soon</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your data is always yours. Export your complete memory to a standard JSON format.
              </p>
              <button disabled className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg font-medium text-sm cursor-not-allowed">
                Export Data.zil
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
