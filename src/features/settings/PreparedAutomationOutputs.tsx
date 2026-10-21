import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.ts';
import { hasLocalSampleData } from '../../utils/dataMode.ts';
import { automationClient, AUTOMATION_UPDATED_EVENT, type AutomationOutput } from '../../services/automationClient.ts';

const safeHref = (value: unknown) => typeof value === 'string' && /^\/app\/[a-z][a-z0-9-]*(?:\?[^\r\n]*)?$/.test(value) ? value : null;
function SourceItems({ value }: {value: any}) {
  if (!value || !Array.isArray(value.items)) return null;
  return <div className="mt-2"><p className="text-xs text-muted">{value.count ?? value.items.length} record(s){value.truncated ? ' · showing the first 100' : ''}</p>
    <ul className="mt-1 space-y-1 text-sm">{value.items.map((item: any, i: number) => <li key={`${item.sourceId || i}`} className="break-words">
      {safeHref(item.href) ? <Link className="text-brand-blue underline" to={item.href}>{item.label || item.sourceId}</Link> : item.label || item.sourceId}
    </li>)}</ul></div>;
}
export function PreparedOutputView({ payload }: {payload: Record<string, any>}) {
  const result = payload.result;
  return <div className="mt-3 space-y-3 text-sm text-muted">
    <p>Cloud records as of {payload.asOfDate}. {payload.status === 'unavailable' ? `Unavailable: ${payload.error}` : 'Prepared for your review.'}</p>
    {payload.action && <p>{payload.action}</p>}{payload.reflections && <p>{payload.reflections}</p>}
    <SourceItems value={payload} />
    {['pendingIntake', 'knowledge', 'assets', 'openPlan', 'openPromises', 'recordedChanges', 'importExceptions', 'incompleteImports'].map(key => payload[key] && <div key={key}>
      <strong>{({pendingIntake:'Capture intake awaiting review',knowledge:'Recorded knowledge',assets:'Reusable assets',openPlan:'Open Plan',openPromises:'Open promises',recordedChanges:'Recorded touches this week',importExceptions:'Import exceptions',incompleteImports:'Incomplete imports'} as Record<string,string>)[key]}</strong>
      <SourceItems value={payload[key]} /></div>)}
    {payload.briefs && <ul className="space-y-2">{payload.briefs.map((row: any) => <li key={row.sourceId}>
      <Link className="text-brand-blue underline" to={`/app/accounts?accountId=${encodeURIComponent(row.sourceId)}`}>{row.account || row.sourceId}</Link>
      <p>{row.opportunityIds.length} opportunity link(s) · {row.stakeholderIds.length} stakeholder link(s) · {row.openPromiseIds.length} promise link(s)</p>
      {row.missing.map((line: string) => <p key={line}>{line}</p>)}</li>)}</ul>}
    {payload.reconciliation?.length > 0 && <div><strong>Possible Capture → Plan matches · confirm in Capture</strong>
      <ul>{payload.reconciliation.map((row: any, i: number) => <li key={`${row.activityId}:${row.planId}:${i}`}><Link className="underline text-brand-blue" to={safeHref(row.href) || '/app/capture'}>{row.label}</Link> · {row.reason}</li>)}</ul></div>}
    {payload.missingValues?.length > 0 && <div><strong>Amount or FX missing</strong><SourceItems value={{items:payload.missingValues,count:payload.missingValues.length}} /></div>}
    {payload.knowledgeCount !== undefined && <p>{payload.knowledgeCount} knowledge note(s) · {payload.assetCount} sales asset(s) available to review.</p>}
    {payload.reuseCandidates?.length > 0 && <div><strong>Possible asset reuse · review relevance</strong><SourceItems value={{items:payload.reuseCandidates,count:payload.reuseCandidates.length}} /></div>}
    {result?.totals && <div><strong>{result.rows.length} matching row(s) · definition version {payload.definitionVersion}</strong>
      <dl className="mt-2 grid grid-cols-2 gap-2">{Object.entries(result.totals).map(([key, metric]: [string, any]) => <div key={key}>
        <dt>{key}</dt><dd className="font-semibold text-ink">{metric.value === null ? 'Unavailable' : metric.value}{metric.missing ? ` · ${metric.missing} missing` : ''}</dd></div>)}</dl>
      <p className="mt-2 text-xs">{result.grain}</p></div>}
    {result?.results && <ul>{result.results.map((row: any) => <li key={row.reportId}>
      <Link className="underline text-brand-blue" to={`/app/reports?report=${encodeURIComponent(row.reportId)}`}>Report {row.reportId}</Link> · version {row.version ?? 'missing'} · {row.error || `${row.run?.rows.length || 0} matching rows`}</li>)}</ul>}
    {payload.sourceCounts && <p>{Object.values(payload.sourceCounts as Record<string, number>).reduce((sum, n) => sum + n, 0)} cloud source row(s) checked. Latest cloud touch: {payload.latestCloudActivity || 'None recorded'}.</p>}
    <p className="text-xs">{payload.limitations?.join(' ')}</p>
    {payload.money && <p className="text-xs">Money basis: {payload.money.currency} · planning FX dated {payload.money.ratesAsOf}.</p>}
  </div>;
}

/** Compact contextual entry on existing destinations; contents load only on request. */
export function AutomationWorkspaceCard() {
  const { user } = useAuth(), { pathname } = useLocation();
  const ownerId = user?.id;
  const [state, setState] = useState<{owner:string; outputs:AutomationOutput[]; enabled:boolean} | null>(null);
  const [selected, setSelected] = useState<AutomationOutput | null>(null), [error, setError] = useState('');
  const sample = hasLocalSampleData();
  useEffect(() => {
    let active = true, sequence = 0;
    setState(null); setSelected(null); setError('');
    if (!ownerId || sample) return;
    const owner = ownerId;
    const refresh = async () => {
      const request = ++sequence;
      try { const response = await automationClient.load(owner);
        if (active && request === sequence) setState({ owner, outputs:response.outputs || [], enabled:response.config.enabled });
      } catch { if (active && request === sequence) setState(null); }
    };
    void refresh();
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    window.addEventListener(AUTOMATION_UPDATED_EVENT, refresh);
    return () => { active = false; window.clearInterval(tick); window.removeEventListener(AUTOMATION_UPDATED_EVENT, refresh); };
  }, [ownerId, pathname, sample]);
  if (!state || state.owner !== user?.id || sample || !state.outputs.length || pathname === '/app/ask') return null;
  const outputs = state.outputs.filter(row => pathname === '/app/today' || pathname === '/app/settings' || row.href.split('?')[0] === pathname);
  if (!outputs.length) return null;
  const open = async (row: AutomationOutput) => {
    const owner = user!.id; setError(''); setSelected(null);
    try { const result = await automationClient.output!(owner, row.id); setSelected(result.output); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Prepared output could not be loaded.'); }
  };
  return <details className="mx-4 mt-3 min-w-0 rounded-xl border border-line bg-white px-4 py-3 sm:mx-6">
    <summary className="cursor-pointer text-sm font-semibold text-ink">Prepared for review · {outputs.length} saved output(s){!state.enabled ? ' · rules paused' : ''}</summary>
    <p className="mt-2 text-xs text-muted">Saved cloud snapshots. Check the date and sources before acting. <Link className="underline text-brand-blue" to="/app/settings?tab=automations">Manage rules</Link></p>
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">{outputs.slice(0, 30).map(row => <li key={row.id}><button className="w-full rounded-lg border border-line p-3 text-left text-sm text-ink" onClick={() => void open(row)}>
      <strong className="block break-words">{row.title}</strong><span className="text-xs text-muted">{row.period} · prepared {new Date(row.prepared_at).toLocaleString('en')}</span></button></li>)}</ul>
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {selected?.payload && <section className="mt-4 rounded-lg border border-line p-3"><h3 className="font-semibold text-ink">{selected.title}</h3>
      <PreparedOutputView payload={selected.payload} /><Link className="mt-3 inline-block text-sm text-brand-blue underline" to={safeHref(selected.href) || '/app/today'}>Open working page</Link>
      <button className="ml-4 text-sm underline" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(selected, null, 2)], {type:'application/json'}));
        const anchor = document.createElement('a'); anchor.href=url; anchor.download=`memoire-prepared-${selected.kind}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export this snapshot</button></section>}
  </details>;
}
