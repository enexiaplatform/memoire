import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Eye, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import type { AccountMemoryRecord } from '../../services/accountStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import {
  createQuote,
  deliveryStatuses,
  deleteQuote,
  emptyQuoteInput,
  getQuoteCommercialStage,
  getQuoteRisk,
  loadQuotes,
  loadQuotesForUser,
  paymentStatuses,
  purchaseOrderStatuses,
  quoteRiskTone,
  quoteStatuses,
  summarizeQuotes,
  updateQuote,
  type QuoteInput,
  type QuoteRecord,
  type QuoteStatus,
  type DeliveryStatus,
  type PaymentStatus,
  type PurchaseOrderStatus,
} from '../../services/quoteStore';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatCurrencyAmount as formatMoney } from '../../utils/currency';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function QuotesPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAccountName = searchParams.get('accountName') || '';
  const requestedOpportunityId = searchParams.get('opportunityId') || '';
  const requestedOpportunityName = searchParams.get('opportunityName') || '';
  const requestedQuoteId = searchParams.get('quoteId') || '';
  const requestedSearch = requestedOpportunityName || requestedAccountName;
  const createRequested = searchParams.get('create') === '1';
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => requestedSearch);
  const [statusFilter, setStatusFilter] = useState<'All' | QuoteStatus>('All');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<QuoteRecord | null>(null);
  const [form, setForm] = useState<QuoteInput>(emptyQuoteInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    let mounted = true;
    async function loadPage() {
      setLoading(true);
      try {
        const [workspaceData, quoteData] = await Promise.all([
          loadSalesWorkspaceData(dataUserId),
          dataUserId ? loadQuotesForUser(dataUserId) : Promise.resolve(loadQuotes()),
        ]);
        if (!mounted) return;
        setAccounts(workspaceData.accounts);
        setOpportunities(workspaceData.opportunities);
        setQuotes(quoteData);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (!authLoading) void loadPage();
    return () => {
      mounted = false;
    };
  }, [authLoading, dataUserId]);

  useEffect(() => {
    if (requestedSearch) setSearch(requestedSearch);
  }, [requestedSearch]);

  const summary = useMemo(() => summarizeQuotes(quotes), [quotes]);
  const visibleQuotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return quotes
      .filter((quote) => (
        (!query || [
          quote.quoteId,
          quote.title,
          quote.accountName,
          quote.opportunityName,
          quote.nextAction,
        ].join(' ').toLowerCase().includes(query)) &&
        (statusFilter === 'All' || quote.status === statusFilter)
      ))
      .sort((a, b) => quoteSortRank(b) - quoteSortRank(a) || b.updatedAt.localeCompare(a.updatedAt));
  }, [quotes, search, statusFilter]);

  const openCreatePanel = () => {
    setEditingQuote(null);
    setForm({
      ...emptyQuoteInput,
      quoteDate: todayKey(),
      accountName: requestedAccountName,
      opportunityId: requestedOpportunityId,
      opportunityName: requestedOpportunityName,
    });
    setPanelOpen(true);
    setSaveState('idle');
    setMessage('');
  };

  useEffect(() => {
    if (!createRequested || authLoading) return;

    setEditingQuote(null);
    setForm({
      ...emptyQuoteInput,
      quoteDate: todayKey(),
      accountName: requestedAccountName,
      opportunityId: requestedOpportunityId,
      opportunityName: requestedOpportunityName,
    });
    setPanelOpen(true);
    setSaveState('idle');
    setMessage('');

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('create');
    setSearchParams(nextParams, { replace: true });
  }, [
    authLoading,
    createRequested,
    requestedAccountName,
    requestedOpportunityId,
    requestedOpportunityName,
    searchParams,
    setSearchParams,
  ]);

  const openEditPanel = (quote: QuoteRecord) => {
    setEditingQuote(quote);
    setForm(quoteToInput(quote));
    setPanelOpen(true);
    setSaveState('idle');
    setMessage('');
  };

  useEffect(() => {
    if (!requestedQuoteId || loading) return;

    const quote = quotes.find((item) => item.id === requestedQuoteId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('quoteId');
    setSearchParams(nextParams, { replace: true });

    if (!quote) {
      setMessage('Quote not found. Review the current quote list.');
      return;
    }

    setEditingQuote(quote);
    setForm(quoteToInput(quote));
    setPanelOpen(true);
    setSaveState('idle');
    setMessage('');
  }, [loading, quotes, requestedQuoteId, searchParams, setSearchParams]);

  const closePanel = () => {
    setPanelOpen(false);
    setEditingQuote(null);
    setForm(emptyQuoteInput);
    setSaveState('idle');
  };

  const viewQuoteInList = (quote: QuoteRecord) => {
    setSearch(quote.quoteId || quote.title);
    setStatusFilter('All');
    closePanel();
  };

  const saveQuote = () => {
    if (!form.title.trim() || !form.accountName.trim()) {
      setSaveState('error');
      setMessage('Add a quote title and account.');
      return;
    }

    setSaveState('saving');
    const saved = editingQuote ? updateQuote(editingQuote, form) : createQuote(form);
    setQuotes([
      saved,
      ...quotes.filter((quote) => quote.id !== saved.id),
    ]);
    setSaveState('saved');
    setMessage(editingQuote ? 'Quote updated.' : 'Quote created.');
    setEditingQuote(saved);
  };

  const removeQuote = (quote: QuoteRecord) => {
    deleteQuote(quote.id);
    setQuotes(quotes.filter((item) => item.id !== quote.id));
    closePanel();
  };

  const setFormValue = <K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleOpportunityChange = (opportunityId: string) => {
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    setForm((current) => ({
      ...current,
      opportunityId,
      opportunityName: opportunity?.opportunityName || '',
      accountName: opportunity?.accountName || current.accountName,
      amount: current.amount ?? opportunity?.estimatedValue ?? null,
      currency: current.currency || opportunity?.currency || 'VND',
    }));
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Commercial</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Quotes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Track expiry, PO, delivery, payment, and the next commercial action.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreatePanel}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Create quote
          </button>
          <DataModePill
            compact
            isLoading={authLoading || loading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={isSupabaseConfigured}
            hasSampleData={sampleDataActive}
          />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuoteMetric label="Sent quotes" value={summary.sentQuotes} tone={summary.sentQuotes ? 'blue' : 'green'} />
        <QuoteMetric label="Expiring soon" value={summary.expiringSoon} tone={summary.expiringSoon ? 'amber' : 'green'} />
        <QuoteMetric label="Pending PO" value={summary.pendingPo} tone={summary.pendingPo ? 'blue' : 'green'} />
        <QuoteMetric label="Accepted value" value={formatMoney(summary.acceptedValue, 'VND')} tone={summary.acceptedValue ? 'green' : 'blue'} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(260px,1fr)_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search quote, account, action..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'All' | QuoteStatus)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue"
            >
              {['All', ...quoteStatuses].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <Link to="/app/opportunities" className="inline-flex w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
            Open pipeline
          </Link>
        </div>
      </section>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          Loading quotes...
        </div>
      ) : quotes.length === 0 ? (
        <QuoteEmptyState onCreate={openCreatePanel} />
      ) : visibleQuotes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-900">No quotes match these filters.</p>
          <p className="mt-1 text-sm text-gray-500">Clear search or status to review all quotes.</p>
        </div>
      ) : (
        <QuoteTable quotes={visibleQuotes} onOpen={openEditPanel} />
      )}

      <details className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-navy">Why this matters</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500">
          Quotes bridge pipeline to commercial money. Keep expiry, PO, delivery, payment, and margin risk visible.
        </p>
      </details>

      {panelOpen && (
        <QuotePanel
          form={form}
          saveState={saveState}
          message={message}
          editingQuote={editingQuote}
          accounts={accounts}
          opportunities={opportunities}
          onChange={setFormValue}
          onOpportunityChange={handleOpportunityChange}
          onSave={saveQuote}
          onCreateAnother={openCreatePanel}
          onViewQuote={viewQuoteInList}
          onClose={closePanel}
          onDelete={editingQuote ? () => removeQuote(editingQuote) : undefined}
        />
      )}
    </div>
  );
}

function QuoteTable({ quotes, onOpen }: { quotes: QuoteRecord[]; onOpen: (quote: QuoteRecord) => void }) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-bold text-navy">Quote list</h2>
        <p className="mt-1 text-xs text-gray-500">{quotes.length.toLocaleString()} quotes after filters</p>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="border-b border-gray-200 px-4 py-3">Quote</th>
              <th className="border-b border-gray-200 px-4 py-3">Account</th>
              <th className="border-b border-gray-200 px-4 py-3">Opportunity</th>
              <th className="border-b border-gray-200 px-4 py-3">Amount</th>
              <th className="border-b border-gray-200 px-4 py-3">Status</th>
              <th className="border-b border-gray-200 px-4 py-3">Valid until</th>
              <th className="border-b border-gray-200 px-4 py-3">Next action</th>
              <th className="border-b border-gray-200 px-4 py-3 text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {quotes.map((quote) => {
              const risk = getQuoteRisk(quote);
              return (
                <tr key={quote.id} onClick={() => onOpen(quote)} className="cursor-pointer hover:bg-blue-50/60">
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] truncate font-bold text-navy" title={quote.title}>{quote.title}</p>
                    <p className="mt-1 text-xs font-semibold text-gray-400">{quote.quoteId}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{quote.accountName}</td>
                  <td className="px-4 py-3 text-gray-600">{quote.opportunityName || 'Not linked'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-gray-800">
                    {quote.amount ? formatMoney(quote.amount, quote.currency) : 'Not set'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge label={quote.status} tone={statusTone(quote.status)} />
                      {quote.status === 'Accepted' && <Badge label={commercialStageLabel(quote)} tone={commercialStageTone(quote)} />}
                      {risk !== 'None' && <Badge label={risk} tone={quoteRiskTone(risk)} />}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">{quote.validUntil || 'Not set'}</td>
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] truncate text-gray-700" title={quote.nextAction}>{quote.nextAction || 'No next action'}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(quote); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:border-brand-blue hover:text-brand-blue" title="Open quote">
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuotePanel({
  form,
  saveState,
  message,
  editingQuote,
  accounts,
  opportunities,
  onChange,
  onOpportunityChange,
  onSave,
  onCreateAnother,
  onViewQuote,
  onClose,
  onDelete,
}: {
  form: QuoteInput;
  saveState: SaveState;
  message: string;
  editingQuote: QuoteRecord | null;
  accounts: AccountMemoryRecord[];
  opportunities: CrmLiteOpportunity[];
  onChange: <K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) => void;
  onOpportunityChange: (opportunityId: string) => void;
  onSave: () => void;
  onCreateAnother: () => void;
  onViewQuote: (quote: QuoteRecord) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const risk = editingQuote ? getQuoteRisk({ ...editingQuote, ...form, id: editingQuote.id, createdAt: editingQuote.createdAt, updatedAt: editingQuote.updatedAt }) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/30">
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Quote Tracker</p>
            <h2 className="mt-1 text-xl font-bold text-navy">{editingQuote ? 'Edit quote' : 'Create quote'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-5">
          {risk && risk !== 'None' && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <Badge label={risk} tone={quoteRiskTone(risk)} />
            </div>
          )}

          {form.status === 'Accepted' && (
            <FormSection title="Commercial progress">
              <SelectInput label="PO" value={form.poStatus} onChange={(value) => onChange('poStatus', value as PurchaseOrderStatus)}>
                {purchaseOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </SelectInput>
              <SelectInput label="Delivery" value={form.deliveryStatus} onChange={(value) => onChange('deliveryStatus', value as DeliveryStatus)}>
                {deliveryStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </SelectInput>
              <DateInput label="Expected delivery" value={form.expectedDeliveryDate} onChange={(value) => onChange('expectedDeliveryDate', value)} />
              <SelectInput label="Payment" value={form.paymentStatus} onChange={(value) => onChange('paymentStatus', value as PaymentStatus)}>
                {paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </SelectInput>
              <DateInput label="Payment due" value={form.paymentDueDate} onChange={(value) => onChange('paymentDueDate', value)} />
            </FormSection>
          )}

          <FormSection title="Quote basics">
            <TextInput label="Quote title" value={form.title} onChange={(value) => onChange('title', value)} />
            <TextInput label="Quote ID" value={form.quoteId} placeholder="Auto if blank" onChange={(value) => onChange('quoteId', value)} />
            <SelectInput label="Account" value={form.accountName} onChange={(value) => onChange('accountName', value)}>
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.accountName}>{account.accountName}</option>
              ))}
            </SelectInput>
            <SelectInput label="Opportunity" value={form.opportunityId || ''} onChange={onOpportunityChange}>
              <option value="">Not linked</option>
              {opportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>{opportunity.accountName} / {opportunity.opportunityName}</option>
              ))}
            </SelectInput>
            <DateInput label="Quote date" value={form.quoteDate} onChange={(value) => onChange('quoteDate', value)} />
            <DateInput label="Valid until" value={form.validUntil} onChange={(value) => onChange('validUntil', value)} />
          </FormSection>

          <FormSection title="Commercial terms">
            <NumberInput label="Amount" value={form.amount} onChange={(value) => onChange('amount', value)} />
            <TextInput label="Currency" value={form.currency} onChange={(value) => onChange('currency', value)} />
            <NumberInput label="Gross margin %" value={form.grossMarginEstimate} onChange={(value) => onChange('grossMarginEstimate', value)} />
            <NumberInput label="Discount %" value={form.discount} onChange={(value) => onChange('discount', value)} />
            <TextInput label="Payment term" value={form.paymentTerm} placeholder="Example: 30 days after PO" onChange={(value) => onChange('paymentTerm', value)} />
            <SelectInput label="Status" value={form.status} onChange={(value) => onChange('status', value as QuoteStatus)}>
              {quoteStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </SelectInput>
          </FormSection>

          <FormSection title="Follow-up">
            <TextInput label="Next action" value={form.nextAction} placeholder="Follow up before expiry" onChange={(value) => onChange('nextAction', value)} />
            <label className="md:col-span-2">
              <span className="text-sm font-bold text-navy">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => onChange('notes', event.target.value)}
                rows={3}
                className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
          </FormSection>

          {message && (
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${saveState === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <p>{message}</p>
              {saveState === 'saved' && editingQuote && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onViewQuote(editingQuote)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                    View quote
                  </button>
                  <button type="button" onClick={onCreateAnother} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-emerald-100">
                    Create another
                  </button>
                  <Link to="/app/revenue" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-blue ring-1 ring-emerald-100">
                    Open revenue view
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {onDelete && (
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onSave} disabled={saveState === 'saving'} className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
              {saveState === 'saving' ? 'Saving...' : 'Save quote'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function QuoteEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <CalendarDays className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-navy">Create your first quote.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Start with one sent or draft quote so Memoire can track the path from quote to paid.
      </p>
      <button type="button" onClick={onCreate} className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
        <Plus className="h-4 w-4" />
        Create quote
      </button>
    </section>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function TextInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-bold text-navy">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
    </label>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-bold text-navy">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label>
      <span className="text-sm font-bold text-navy">{label}</span>
      <input type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
    </label>
  );
}

function SelectInput({ label, value, children, onChange }: { label: string; value: string; children: React.ReactNode; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-bold text-navy">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">
        {children}
      </select>
    </label>
  );
}

function QuoteMetric({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const classes = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>;
}

function statusTone(status: QuoteStatus): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
  if (status === 'Accepted') return 'green';
  if (status === 'Rejected' || status === 'Expired') return 'red';
  if (status === 'Sent' || status === 'Revised') return 'blue';
  return 'gray';
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}

function quoteSortRank(quote: QuoteRecord) {
  const risk = getQuoteRisk(quote);
  if (risk === 'Payment overdue') return 8;
  if (risk === 'Delivery overdue') return 7;
  if (risk === 'Expired') return 6;
  if (risk === 'Expiring soon') return 5;
  if (risk === 'PO follow-up') return 4;
  if (risk === 'Needs commercial follow-up') return 3;
  if (quote.status === 'Sent' || quote.status === 'Revised') return 2;
  return 1;
}

function commercialStageLabel(quote: QuoteRecord) {
  const stage = getQuoteCommercialStage(quote);
  if (stage === 'Pending PO') return 'Awaiting PO';
  if (stage === 'Pending delivery') return quote.deliveryStatus === 'Scheduled' ? 'Delivery scheduled' : 'Awaiting delivery';
  if (stage === 'Pending payment') return quote.paymentStatus === 'Due' ? 'Payment due' : 'Awaiting payment';
  return stage;
}

function commercialStageTone(quote: QuoteRecord): 'green' | 'amber' | 'blue' {
  if (quote.paymentStatus === 'Paid') return 'green';
  if (quote.deliveryStatus === 'Delivered') return 'amber';
  return 'blue';
}

function quoteToInput(quote: QuoteRecord): QuoteInput {
  const { id, createdAt, updatedAt, ...input } = quote;
  void id;
  void createdAt;
  void updatedAt;
  return input;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
