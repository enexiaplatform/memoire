import { useEffect, useMemo, useState } from 'react';
import { conditionCategories, evidenceMatchesCondition, projectCommercialConditions, type CommercialCondition, type ConditionReading, type ConditionIntent, type ConditionEvidenceLink } from '../../domain/commercialKernel/commercialCondition';
import { conditionReferenceIndex } from '../../domain/commercialKernel/conditionReferences';
import { createCommercialCondition, changeCommercialCondition } from '../../domain/commercialKernel/conditionCommands';
import { CONDITION_UPDATED_EVENT, loadCommercialConditions, loadCommercialConditionsForWorkspace } from '../../services/commercialKernel/conditionStore';
import { EVIDENCE_UPDATED_EVENT, loadCommercialEvidence, loadCommercialEvidenceForWorkspace } from '../../services/commercialKernel/evidenceStore';
import type { CommercialEvidence } from '../../domain/commercialKernel/commercialEvidence';
import type { AccountMemoryRecord } from '../../services/accountStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { CommercialScope } from '../../domain/commercialKernel/types';
import type { CommandResult } from '../../domain/commercialKernel/commands';

const inputClass = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
const labels = { supported: 'Supported', assumed: 'Assumption', hypothesis: 'Being tested', contradicted: 'Conflicting evidence' };
const intentLabels = { assumed: 'Operating assumption', hypothesis: 'Proposition to test' };
const displayDate = (value: string) => value.slice(0, 10);
function safeSourceUrl(url?: string | null) {
  try { const parsed = new URL(url || ''); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}
export function CommercialStatePanel({ opportunity, accounts, userId, sampleDataActive }: {
  opportunity: CrmLiteOpportunity; accounts: AccountMemoryRecord[]; userId?: string; sampleDataActive: boolean;
}) {
  const [conditions, setConditions] = useState<CommercialCondition[]>([]);
  const [evidence, setEvidence] = useState<CommercialEvidence[]>([]);
  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState('');
  const [accountId, setAccountId] = useState(opportunity.accountId || '');
  const [intent, setIntent] = useState<ConditionIntent>('hypothesis');
  const [category, setCategory] = useState<CommercialCondition['conditionCategory']>('commercial');
  const [validFrom, setValidFrom] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [assessment, setAssessment] = useState<ConditionEvidenceLink['assessment']>('supports');
  const [message, setMessage] = useState('');
  const scope: CommercialScope = { userId: userId || null, sampleDataActive };
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      setConditions(loadCommercialConditions().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setEvidence(loadCommercialEvidence().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
    };
    refresh();
    void Promise.all([loadCommercialConditionsForWorkspace(userId, sampleDataActive), loadCommercialEvidenceForWorkspace(userId, sampleDataActive)]).then(refresh);
    window.addEventListener(CONDITION_UPDATED_EVENT, refresh);
    window.addEventListener(EVIDENCE_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { active = false; window.removeEventListener(CONDITION_UPDATED_EVENT, refresh); window.removeEventListener(EVIDENCE_UPDATED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [userId, sampleDataActive]);
  const readings = useMemo(() => [...projectCommercialConditions(conditions.filter(c => c.opportunityId === opportunity.id), evidence).values()], [conditions, evidence, opportunity.id]);
  const references = conditionReferenceIndex(accounts, [opportunity], evidence);
  const accepted = (result: CommandResult<CommercialCondition>) => {
    setMessage(result.ok ? result.warning || 'Saved in this browser. Account sync runs when connected.' : result.error);
    return result.ok;
  };
  const choices = evidence.filter(e => (e.accountId === accountId || (!e.accountId && e.opportunityId === opportunity.id && Boolean(accountId))) && (!e.opportunityId || e.opportunityId === opportunity.id));
  const activeReadings = readings.filter(r => r.condition.lifecycle === 'active');
  const retired = readings.filter(r => r.condition.lifecycle === 'retired');
  return <section aria-label="Commercial state" className="mt-5 rounded-panel border border-line bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Commercial state</h3>
      <button type="button" className="text-sm font-semibold text-brand-blue" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add condition'}</button></div>
    {!activeReadings.length && <p className="mt-2 text-sm text-muted">No active commercial conditions recorded yet. Capture a concrete proposition you rely on, are testing, or have evidence for.</p>}
    {activeReadings.map(reading => <ConditionRow key={reading.condition.id} reading={reading} evidence={evidence} onChange={change => accepted(changeCommercialCondition(scope, reading.condition.id, reading.condition.updatedAt, change, references))} />)}
    {retired.length > 0 && <details className="mt-3 text-sm"><summary>Retired propositions ({retired.length})</summary>{retired.map(reading => <ConditionRow key={reading.condition.id} reading={reading} evidence={evidence} />)}</details>}
    {adding && <div className="mt-4 space-y-3 border-t border-line pt-3">
      <label className="block text-sm">Account<select className={inputClass} value={accountId} onChange={e => { setAccountId(e.target.value); setEvidenceId(''); }}><option value="">Choose the account this proposition concerns</option>{accounts.filter(a => Boolean(a.isSample || a.source === 'demo') === sampleDataActive && (!opportunity.accountId || a.id === opportunity.accountId)).map(a => <option key={a.id} value={a.id}>{a.accountName}{a.accountCode ? ` · ${a.accountCode}` : ''}</option>)}</select></label>
      <label className="block text-sm">Commercial proposition<textarea className={inputClass} maxLength={1000} value={statement} onChange={e => setStatement(e.target.value)} placeholder="For example: Customer budget is approved." /></label>
      <p className="text-xs text-muted">Write something evidence can support or contradict. Tasks such as “call customer” belong in actions. For a different proposition, retire the old one and add a new one.</p>
      <label className="block text-sm">Without supporting evidence, treat this as<select className={inputClass} value={intent} onChange={e => setIntent(e.target.value as ConditionIntent)}>{Object.entries(intentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <details><summary className="cursor-pointer text-sm">Category and effective date (optional)</summary>
        <label className="block text-sm">Category<select className={inputClass} value={category} onChange={e => setCategory(e.target.value as typeof category)}>{conditionCategories.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label>
        <label className="block text-sm">Business-effective date, if known<input type="date" className={inputClass} value={validFrom} onChange={e => setValidFrom(e.target.value)} /></label></details>
      <label className="block text-sm">Existing evidence (optional)<select className={inputClass} value={evidenceId} onChange={e => setEvidenceId(e.target.value)}><option value="">No evidence linked yet</option>{choices.map(e => <option key={e.id} value={e.id}>{e.summary} · {e.observedAt}</option>)}</select></label>
      {evidenceId && <EvidenceAssessment value={assessment} onChange={setAssessment} />}
      <button type="button" disabled={!statement.trim() || !accountId} className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => {
        const result = createCommercialCondition(scope, { accountId, opportunityId: opportunity.id, statement, conditionCategory: category, intent, validFrom: validFrom || null,
          ...(evidenceId ? { evidence: { evidenceId, assessment } } : {}) }, references);
        if (accepted(result)) { setAdding(false); setStatement(''); setEvidenceId(''); setValidFrom(''); }
      }}>Record condition</button>
    </div>}
    {message && <p role="status" className="mt-3 text-sm text-muted">{message}</p>}
  </section>;
}
function EvidenceAssessment({ value, onChange }: { value: ConditionEvidenceLink['assessment']; onChange: (value: ConditionEvidenceLink['assessment']) => void }) {
  return <label className="block text-sm">This evidence<select className={inputClass} value={value} onChange={e => onChange(e.target.value as typeof value)}><option value="supports">Supports this proposition</option><option value="contradicts">Contradicts this proposition</option></select></label>;
}
function EvidenceList({ title, items }: { title: string; items: CommercialEvidence[] }) {
  return items.length > 0 && <div className="mt-3"><h4 className="text-xs font-semibold text-ink">{title}</h4>{items.map(e => <blockquote key={e.id} className="mt-2 border-l-2 border-line pl-3 text-sm">
    <p>{e.evidenceText}</p><p className="mt-1 text-xs text-muted">Observed {e.observedAt} · Recorded {displayDate(e.recordedAt)} · {e.sourceType}{e.sourceId ? ` · ${e.sourceId}` : ''}</p>
    {safeSourceUrl(e.sourceUrl) && <a href={safeSourceUrl(e.sourceUrl)} target="_blank" rel="noreferrer" className="text-xs text-brand-blue">Open source</a>}
  </blockquote>)}</div>;
}
export function ConditionRow({ reading, evidence, onChange }: {
  reading: ConditionReading; evidence: CommercialEvidence[];
  onChange?: (change: Parameters<typeof changeCommercialCondition>[3]) => boolean;
}) {
  const [linking, setLinking] = useState(false);
  const [evidenceId, setEvidenceId] = useState('');
  const [assessment, setAssessment] = useState<ConditionEvidenceLink['assessment']>('supports');
  const [supersedesEvidenceId, setSupersedesEvidenceId] = useState('');
  const c = reading.condition;
  const linked = new Set(c.evidenceLinks.map(l => l.evidenceId));
  const choices = linking ? evidence.filter(e => !linked.has(e.id) && evidenceMatchesCondition(c,e)) : [];
  return <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm text-ink"><span className="mr-2 font-semibold">{labels[reading.state]}</span>{c.statement}</summary>
    <p className="mt-2 text-xs text-muted">Recorded {displayDate(c.createdAt)} · Updated {displayDate(c.updatedAt)}{c.validFrom ? ` · Effective ${c.validFrom}` : ' · Effective date not specified'}</p>
    <p className="mt-1 text-xs text-muted">Operator intent: {intentLabels[c.intent]}. {reading.state === 'contradicted' ? 'Current evidence conflicts with this proposition; both sides remain visible.' : reading.state === 'supported' ? 'Supported by the evidence explicitly linked below.' : 'No current supporting evidence is linked.'}</p>
    <EvidenceList title="Supporting evidence" items={reading.supporting} /><EvidenceList title="Conflicting evidence" items={reading.conflicting} /><EvidenceList title="Replaced evidence — retained history" items={reading.historical} />
    {reading.unresolvedEvidenceIds.length > 0 && <p role="status" className="mt-2 text-sm text-amber-700">Some linked evidence is unavailable. It is excluded from this reading; restore or reconnect its source before relying on it.</p>}
    {onChange && <div className="mt-3 space-y-3"><label className="block text-sm">Operator intent<select className={inputClass} value={c.intent} onChange={e => onChange({ kind: 'intent', intent: e.target.value as ConditionIntent })}>{Object.entries(intentLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button type="button" className="mr-4 text-sm text-brand-blue" onClick={() => setLinking(!linking)}>Link evidence</button>
      <button type="button" className="text-sm text-muted" onClick={() => onChange({ kind: 'retire' })}>Retire proposition</button>
      {linking && <div className="space-y-2"><label className="block text-sm">Evidence<select className={inputClass} value={evidenceId} onChange={e => setEvidenceId(e.target.value)}><option value="">Choose evidence</option>{choices.map(e => <option key={e.id} value={e.id}>{e.summary} · {e.observedAt}</option>)}</select></label>
        <EvidenceAssessment value={assessment} onChange={setAssessment} />
        <label className="block text-sm">Replaces an earlier observation only if explicitly confirmed<select className={inputClass} value={supersedesEvidenceId} onChange={e => setSupersedesEvidenceId(e.target.value)}><option value="">Independent evidence — keep both current</option>{[...reading.supporting,...reading.conflicting].map(e => <option key={e.id} value={e.id}>{e.summary} · {e.observedAt}</option>)}</select></label>
        <button type="button" disabled={!evidenceId} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={() => { if (onChange({ kind: 'link', link: { evidenceId, assessment, supersedesEvidenceId: supersedesEvidenceId || null } })) { setLinking(false); setEvidenceId(''); setSupersedesEvidenceId(''); } }}>Confirm evidence link</button>
      </div>}
    </div>}
  </details>;
}
