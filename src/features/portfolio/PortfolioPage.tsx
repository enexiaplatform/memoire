import { PageHeader } from '../../components/layout/PageFrame';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../auth/authContext';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { loadPortfolio, savePortfolio, type PortfolioLoad, type PortfolioScope } from '../../services/portfolioStore';
import { portfolioAssignments, portfolioKinds, portfolioNodes, suggestPortfolioNode, type PortfolioNodeData } from '../../domain/portfolio/portfolioCatalog';
import { buildPortfolioFacts, capturePortfolioMoneyBasis, summarizePortfolio } from '../../domain/portfolio/portfolioAnalytics';
import { EXCHANGE_RATES_CHANGED_EVENT, REPORTING_CURRENCY_CHANGED_EVENT } from '../../utils/money';
import { hasLocalSampleData } from '../../utils/dataMode';

const kinds = { unit: 'Business unit', brand: 'Brand', group: 'Product group', product: 'Product / solution' };
const blank: PortfolioNodeData = { kind: 'brand', name: '', code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] };
const control = 'min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-navy';
const button = 'rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50';

export function PortfolioPage() {
  const { user, loading: authLoading } = useAuthContext();
  const demo = useDemoWorkspaceMode();
  const sample = demo || hasLocalSampleData();
  const scope = useMemo<PortfolioScope>(() => ({ userId: sample ? null : user?.id || null, sampleDataActive: sample }), [sample, user?.id]);
  const [loaded, setLoaded] = useState<{ scope: string; catalog: PortfolioLoad; workspace: SalesWorkspaceData } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PortfolioNodeData>(blank);
  const [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [search, setSearch] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [assignment, setAssignment] = useState({ businessUnitId: '', brandId: '', groupId: '', productId: '' });
  const [assignmentVersion, setAssignmentVersion] = useState(0);
  const [, setCurrencyEpoch] = useState(0);
  const scopeKey = `${scope.userId || 'local'}:${sample}`;
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [catalog, workspace] = await Promise.all([loadPortfolio(scope), loadSalesWorkspaceData(scope.userId)]);
      setLoaded({ scope: scopeKey, catalog, workspace });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load the portfolio.'); }
    finally { setBusy(false); }
  }, [scope, scopeKey]);
  useEffect(() => { if (!authLoading) { setLoaded(null); setForm(blank); setEditing(null); setAssignmentId(''); void refresh(); } }, [authLoading, refresh]);
  useEffect(() => {
    const onMoney = () => setCurrencyEpoch(value => value + 1);
    window.addEventListener(EXCHANGE_RATES_CHANGED_EVENT, onMoney); window.addEventListener(REPORTING_CURRENCY_CHANGED_EVENT, onMoney);
    return () => { window.removeEventListener(EXCHANGE_RATES_CHANGED_EVENT, onMoney); window.removeEventListener(REPORTING_CURRENCY_CHANGED_EVENT, onMoney); };
  }, []);
  const current = loaded?.scope === scopeKey ? loaded : null;
  const records = useMemo(() => current?.catalog.records || [], [current]);
  const nodes = useMemo(() => portfolioNodes(records), [records]);
  const money = capturePortfolioMoneyBasis(current?.workspace.opportunities.map(row => row.currency) || []);
  const facts = useMemo(() => current ? buildPortfolioFacts({ opportunities: current.workspace.opportunities,
    outcomes: current.workspace.opportunityOutcomes, records, money, sample }) : [], [current, records, money, sample]);
  const totals = summarizePortfolio(facts);
  const moneyLabel = (amount: number | null) => amount === null ? 'Unavailable' : new Intl.NumberFormat('en', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(amount);
  const apply = async (id: string, state: Parameters<typeof savePortfolio>[1]['state'], expectedVersion: number) => {
    setBusy(true); setError('');
    try {
      const catalog = await savePortfolio(scope, { id, state, expectedVersion,
        opportunity: state.kind === 'assignment' ? current?.workspace.opportunities.find(row => row.id === state.opportunityId) : undefined });
      setLoaded(previous => previous?.scope === scopeKey ? { ...previous, catalog } : previous);
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the catalog.'); return false; }
    finally { setBusy(false); }
  };
  const chooseAssignment = (id: string) => {
    const old = portfolioAssignments(records).find(row => row.opportunityId === id);
    setAssignmentId(id); setAssignmentVersion(old?.version || 0);
    setAssignment({ businessUnitId: old?.businessUnitId || '', brandId: old?.brandId || '', groupId: old?.groupId || '', productId: old?.productId || '' });
  };
  const opportunities = facts.filter(row => !search || `${row.account} ${row.opportunity} ${row.originalBrand} ${row.originalProduct}`.toLowerCase().includes(search.toLowerCase()));
  const selected = current?.workspace.opportunities.find(row => row.id === assignmentId);
  const candidates = (kind: PortfolioNodeData['kind']) => nodes.filter(node => node.kind === kind);
  const options = (kind: PortfolioNodeData['kind']) => candidates(kind).map(node => <option key={node.id} value={node.id}>{node.name}{node.status === 'retired' ? ' (retired)' : ''}</option>);
  return <div className="flex min-w-0 flex-col gap-5" data-testid="portfolio-page">
    <PageHeader title="Products & Brands" description="Organize the lines you carry and link each deal once. Business units classify your own records." actions={<button className={button} disabled={busy || authLoading} onClick={() => void refresh()}>Reload catalog</button>} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!current ? <p className="text-sm text-gray-500">{busy || authLoading ? 'Loading portfolio…' : 'Reload to try again.'}</p> : <>
      <p role="status" className={`rounded-lg p-3 text-sm ${current.catalog.cloud === 'unavailable' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-navy'}`}>{current.catalog.message}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Qualified pipeline', moneyLabel(totals.pipeline), `${totals.activeCount} active deals · ${totals.pipelineMissing} missing amount/rate`],
          ['Won deal value', moneyLabel(totals.won), `${totals.wonCount} won deals · ${totals.wonMissing} missing amount/rate`],
          ['Win rate', totals.winRate === null ? 'Needs 3 decided deals' : `${Math.round(totals.winRate * 100)}%`, `${totals.wonCount + totals.lostCount} decided deals`]].map(([title, value, detail]) =>
          <div key={title} className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm text-gray-500">{title}</p><p className="mt-1 text-xl font-bold text-navy">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>)}
      </div>
      <p className="text-xs text-gray-500">Current pipeline and all-time won/lost outcomes. Partial totals exclude missing amounts/rates. Planning FX dated {money.ratesAsOf}, with workspace overrides. Won value is not cash or accounting revenue. {totals.unmapped} qualified deals have no portfolio classification.</p>
      <section className="grid min-w-0 gap-5 lg:grid-cols-2">
        <form className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5" onSubmit={async event => {
          event.preventDefault();
          if (await apply(editing?.id || `portfolio-${crypto.randomUUID()}`, form, editing?.version || 0)) { setForm(blank); setEditing(null); }
        }}>
          <h2 className="font-bold text-navy">{editing ? 'Edit catalog entry' : 'Add catalog entry'}</h2>
          <label className="text-sm">Type<select aria-label="Type" className={control} value={form.kind} disabled={Boolean(editing)} onChange={event => setForm({ ...blank, kind: event.target.value as PortfolioNodeData['kind'] })}>{portfolioKinds.map(kind => <option key={kind} value={kind}>{kinds[kind]}</option>)}</select></label>
          <label className="text-sm">Name<input required maxLength={200} className={control} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label className="text-sm">Code (optional)<input maxLength={100} className={control} value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /></label>
          <label className="text-sm">Description<textarea maxLength={2000} className={control} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label className="text-sm">Confirmed aliases (one per line)<textarea className={control} value={form.aliases.join('\n')} onChange={event => setForm({ ...form, aliases: event.target.value.split('\n') })} /></label>
          {(form.kind === 'unit' || form.kind === 'group') && <label className="text-sm">Parent<select aria-label="Parent" className={control} value={form.parentId || ''} onChange={event => setForm({ ...form, parentId: event.target.value || null })}><option value="">No parent</option>{candidates(form.kind).filter(node => node.id !== editing?.id).map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>}
          {form.kind === 'product' && <><label className="text-sm">Default brand<select aria-label="Default brand" className={control} value={form.brandId || ''} onChange={event => setForm({ ...form, brandId: event.target.value || null })}><option value="">No default</option>{options('brand')}</select></label><label className="text-sm">Default product group<select aria-label="Default product group" className={control} value={form.groupId || ''} onChange={event => setForm({ ...form, groupId: event.target.value || null })}><option value="">No default</option>{options('group')}</select></label></>}
          <div className="flex flex-wrap gap-2"><button className={button} disabled={busy}>Save entry</button>{editing && <button type="button" className="text-sm font-semibold text-gray-600" onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}</div>
        </form>
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-5"><h2 className="font-bold text-navy">Catalog ({nodes.length})</h2>{!nodes.length && <p className="mt-3 text-sm text-gray-500">Start with one brand or business unit. Entries stay visible before their first deal.</p>}
          <ul className="mt-3 max-h-[38rem] space-y-3 overflow-y-auto">{nodes.map(node => {
            const linked = facts.filter(fact => [fact.businessUnitId, fact.brandId, fact.groupId, fact.productId].includes(node.id));
            const reading = summarizePortfolio(linked);
            return <li key={node.id} className="rounded-lg border border-gray-200 p-3"><p className="break-words font-bold text-navy">{node.name}</p><p className="text-xs text-gray-500">{kinds[node.kind]} · {node.status} · {linked.length} linked records · version {node.version}{node.parentId ? ` · parent: ${nodes.find(parent => parent.id === node.parentId)?.name}` : ''}</p><p className="mt-1 text-sm">Pipeline: {moneyLabel(reading.pipeline)}{reading.pipelineMissing ? ` (partial: ${reading.pipelineMissing} missing)` : ''}</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" disabled={busy} className="text-sm font-bold text-brand-blue" onClick={() => { setEditing({ id: node.id, version: node.version }); setForm({ kind: node.kind, name: node.name, code: node.code, description: node.description, status: node.status, parentId: node.parentId, brandId: node.brandId, groupId: node.groupId, aliases: node.aliases }); }}>Edit</button><button type="button" disabled={busy} className="text-sm font-semibold text-gray-600" onClick={() => void apply(node.id, { kind: node.kind, name: node.name, code: node.code, description: node.description, parentId: node.parentId, brandId: node.brandId, groupId: node.groupId, aliases: node.aliases, status: node.status === 'active' ? 'retired' : 'active' }, node.version)}>{node.status === 'active' ? 'Retire' : 'Reactivate'}</button></div></li>;
          })}</ul>
        </div>
      </section>
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-bold text-navy">Classify existing deals</h2><p className="mt-1 text-sm text-gray-500">Original brand/product text is preserved. Suggested matches need your choice. Bundle amounts are not split between products.</p>
        <label className="mt-3 block text-sm">Find a deal<input className={control} value={search} onChange={event => setSearch(event.target.value)} placeholder="Account, deal, original brand or product" /></label>
        <label className="mt-3 block text-sm">Deal<select aria-label="Deal" className={control} value={assignmentId} onChange={event => chooseAssignment(event.target.value)}><option value="">Choose a deal</option>{opportunities.map(row => <option key={row.id} value={row.id}>{row.account} — {row.opportunity}</option>)}</select></label>
        {selected && <form className="mt-4 flex flex-col gap-3" onSubmit={async event => {
          event.preventDefault(); const previous = portfolioAssignments(records).find(row => row.opportunityId === selected.id);
          const id = previous?.id || `${sample ? 'sample-' : ''}portfolio-assignment:${selected.id}`;
          if (await apply(id, { kind: 'assignment', opportunityId: selected.id,
            businessUnitId: assignment.businessUnitId || null, brandId: assignment.brandId || null, groupId: assignment.groupId || null, productId: assignment.productId || null,
            originalBrand: previous?.originalBrand ?? selected.brand ?? '', originalProduct: previous?.originalProduct ?? selected.productOrSolution ?? '' }, assignmentVersion)) setAssignmentVersion(assignmentVersion + 1);
        }}>
          <p className="break-words text-sm text-gray-500">Original: {selected.brand || 'no brand'} / {selected.productOrSolution || 'no product'}</p>
          <div className="grid gap-3 sm:grid-cols-2">{(['unit', 'brand', 'group', 'product'] as const).map(kind => {
            const field = { unit: 'businessUnitId', brand: 'brandId', group: 'groupId', product: 'productId' }[kind] as keyof typeof assignment;
            return <label key={kind} className="text-sm">{kinds[kind]}<select aria-label={kinds[kind]} className={control} value={assignment[field]} onChange={event => {
              const id = event.target.value; const product = nodes.find(node => node.id === id);
              setAssignment(previous => ({ ...previous, [field]: id, ...(kind === 'product' && product ? { brandId: product.brandId || previous.brandId, groupId: product.groupId || previous.groupId } : {}) }));
            }}><option value="">Unassigned / bundle not allocated</option>{options(kind)}</select></label>;
          })}</div>
          {suggestPortfolioNode(records, 'brand', selected.brand || '') && <button type="button" className="text-left text-sm font-semibold text-brand-blue" onClick={() => setAssignment(previous => ({ ...previous, brandId: suggestPortfolioNode(records, 'brand', selected.brand || '')!.id }))}>Use suggested brand: {suggestPortfolioNode(records, 'brand', selected.brand || '')!.name}</button>}
          <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={busy}>Save classification</button><Link className="text-sm font-bold text-brand-blue" to={`/app/opportunities?opportunityId=${encodeURIComponent(selected.id)}`}>Open source deal</Link></div>
        </form>}
      </section>
    </>}
  </div>;
}
