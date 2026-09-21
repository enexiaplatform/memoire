import { useEffect, useMemo, useState } from 'react';
import { deriveKnownBlockers, type CommercialDependency } from '../../domain/commercialKernel/commercialDependency';
import { createCommercialDependency, retireCommercialDependency } from '../../domain/commercialKernel/dependencyCommands';
import { DEPENDENCY_UPDATED_EVENT, loadCommercialDependencies, loadCommercialDependenciesForWorkspace } from '../../services/commercialKernel/dependencyStore';
import { deriveBuyerProgress } from '../../domain/commercialKernel/buyerProgress';
import { COMMITMENTS_UPDATED_EVENT, loadCommitments, loadCommitmentsForWorkspace } from '../../services/commercialKernel/commitmentStore';
import { EVENTS_UPDATED_EVENT, loadEvents, loadRecentEvents } from '../../services/commercialKernel/eventStore';
import type { CommercialCommitment, CommercialEvent } from '../../domain/commercialKernel/types';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import { conditionCategories, evidenceMatchesCondition, projectCommercialConditions, type CommercialCondition, type ConditionReading, type ConditionIntent, type ConditionEvidenceLink } from '../../domain/commercialKernel/commercialCondition';
import { conditionReferenceIndex } from '../../domain/commercialKernel/conditionReferences';
import { createCommercialCondition, changeCommercialCondition } from '../../domain/commercialKernel/conditionCommands';
import { CONDITION_UPDATED_EVENT, loadCommercialConditions, loadCommercialConditionsForWorkspace } from '../../services/commercialKernel/conditionStore';
import { EVIDENCE_UPDATED_EVENT, loadCommercialEvidence, loadCommercialEvidenceForWorkspace } from '../../services/commercialKernel/evidenceStore';
import { REQUIREMENT_UPDATED_EVENT, loadOutcomeRequirements, loadOutcomeRequirementsForWorkspace } from '../../services/commercialKernel/requirementStore';
import { nextBestQuestion, projectOutcomeRequirements, requirementQuestion, requirementRoles, type OutcomeRequirement, type RequirementRole } from '../../domain/commercialKernel/outcomeRequirement';
import { changeOutcomeRequirement, createOutcomeRequirement, requirementReferenceIndex } from '../../domain/commercialKernel/requirementCommands';
import type { CommercialEvidence } from '../../domain/commercialKernel/commercialEvidence';
import type { AccountMemoryRecord } from '../../services/accountStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { CommercialScope } from '../../domain/commercialKernel/types';
import { recordCommercialEvidence, type CommandResult } from '../../domain/commercialKernel/commands';
import { CommercialTimingSection } from './CommercialTimingSection';
import { ForecastDefensibilitySection } from './ForecastDefensibilitySection';
import { CommercialDecisionSection } from './CommercialDecisionSection';
import { deriveForecastDefensibility } from '../../domain/commercialKernel/deriveForecastDefensibility';
import { todayDateKey } from '../../utils/safeDate';
import type { CommercialTimingAssertion } from '../../domain/commercialKernel/commercialTiming';
import { TIMING_UPDATED_EVENT, loadCommercialTiming, loadCommercialTimingForWorkspace } from '../../services/commercialKernel/timingStore';
import { MONEY_GATE_UPDATED_EVENT, loadCommercialMoneyGates, loadCommercialMoneyGatesForWorkspace } from '../../services/commercialKernel/moneyGateStore';
import type {CommercialMoneyGate,MoneyGateBasisKind} from '../../domain/commercialKernel/moneyGate';
import {createCommercialMoneyGate,retireCommercialMoneyGate} from '../../domain/commercialKernel/moneyGateCommands';
import {deriveMoneyConsequences} from '../../domain/commercialKernel/deriveMoneyConsequences';
import {loadQuotes,loadQuotesForUser,type QuoteRecord} from '../../services/quoteStore';
import {WhatIfScenarioPanel} from './WhatIfScenarioPanel';

const inputClass = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
const labels = { supported: 'Supported', assumed: 'Assumption', hypothesis: 'Being tested', contradicted: 'Conflicting evidence' };
const intentLabels = { assumed: 'Operating assumption', hypothesis: 'Proposition to test' };
const displayDate = (value: string) => value.slice(0, 10);
function safeSourceUrl(url?: string | null) {
  try { const parsed = new URL(url || ''); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}
export function CommercialStatePanel({ opportunity, accounts, userId, sampleDataActive, activities=[] }: {
  opportunity: CrmLiteOpportunity; accounts: AccountMemoryRecord[]; userId?: string; sampleDataActive: boolean; activities?: SalesActivityRecord[];
}) {
  const [conditions, setConditions] = useState<CommercialCondition[]>([]);
  const [evidence, setEvidence] = useState<CommercialEvidence[]>([]);
  const [requirements, setRequirements] = useState<OutcomeRequirement[]>([]);
  const [dependencies,setDependencies]=useState<CommercialDependency[]>([]);
  const [timing,setTiming]=useState<CommercialTimingAssertion[]>([]);
  const [commitments,setCommitments]=useState<CommercialCommitment[]>([]);
  const [moneyGates,setMoneyGates]=useState<CommercialMoneyGate[]>([]);
  const [quotes,setQuotes]=useState<QuoteRecord[]>([]);
  const [events,setEvents]=useState<CommercialEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState('');
  const [accountId, setAccountId] = useState(opportunity.accountId || '');
  const [intent, setIntent] = useState<ConditionIntent>('hypothesis');
  const [category, setCategory] = useState<CommercialCondition['conditionCategory']>('commercial');
  const [validFrom, setValidFrom] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [assessment, setAssessment] = useState<ConditionEvidenceLink['assessment']>('supports');
  const [message, setMessage] = useState('');
  const [showEvidenceForm,setShowEvidenceForm]=useState(false);
  const [evidenceText,setEvidenceText]=useState('');
  const [observedAt,setObservedAt]=useState('');
  const [providedBy,setProvidedBy]=useState<''|'customer'|'self'|'internal'>('');
  const scope: CommercialScope = { userId: userId || null, sampleDataActive };
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      setConditions(loadCommercialConditions().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setEvidence(loadCommercialEvidence().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setRequirements(loadOutcomeRequirements().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setDependencies(loadCommercialDependencies().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setTiming(loadCommercialTiming().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setCommitments(loadCommitments().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
      setMoneyGates(loadCommercialMoneyGates().filter(r=>r.userId===(userId||null)&&Boolean(r.isSample)===sampleDataActive));
      setQuotes(loadQuotes().filter(row=>row.opportunityId===opportunity.id&&Boolean(row.isSample)===sampleDataActive));
      setEvents(loadEvents().filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive));
    };
    refresh();
    void Promise.all([loadCommercialConditionsForWorkspace(userId, sampleDataActive), loadCommercialEvidenceForWorkspace(userId, sampleDataActive), loadOutcomeRequirementsForWorkspace(userId, sampleDataActive),loadCommercialDependenciesForWorkspace(userId,sampleDataActive),loadCommercialTimingForWorkspace(userId,sampleDataActive),loadCommitmentsForWorkspace(userId,sampleDataActive),loadCommercialMoneyGatesForWorkspace(userId,sampleDataActive),userId?loadQuotesForUser(userId):Promise.resolve(loadQuotes()),loadRecentEvents(userId,sampleDataActive,{windowDays:365,limit:2000})]).then(refresh);
    window.addEventListener(CONDITION_UPDATED_EVENT, refresh);
    window.addEventListener(EVIDENCE_UPDATED_EVENT, refresh);
    window.addEventListener(REQUIREMENT_UPDATED_EVENT, refresh);
    window.addEventListener(DEPENDENCY_UPDATED_EVENT,refresh);
    window.addEventListener(TIMING_UPDATED_EVENT,refresh);
    window.addEventListener(COMMITMENTS_UPDATED_EVENT,refresh);
    window.addEventListener(MONEY_GATE_UPDATED_EVENT,refresh);
    window.addEventListener(EVENTS_UPDATED_EVENT,refresh);
    window.addEventListener('storage', refresh);
    return () => { active = false; window.removeEventListener(CONDITION_UPDATED_EVENT, refresh); window.removeEventListener(EVIDENCE_UPDATED_EVENT, refresh); window.removeEventListener(REQUIREMENT_UPDATED_EVENT, refresh);window.removeEventListener(DEPENDENCY_UPDATED_EVENT,refresh);window.removeEventListener(TIMING_UPDATED_EVENT,refresh);window.removeEventListener(COMMITMENTS_UPDATED_EVENT,refresh);window.removeEventListener(MONEY_GATE_UPDATED_EVENT,refresh);window.removeEventListener(EVENTS_UPDATED_EVENT,refresh); window.removeEventListener('storage', refresh); };
  }, [userId, sampleDataActive,opportunity.id]);
  const readings = useMemo(() => [...projectCommercialConditions(conditions.filter(c => c.opportunityId === opportunity.id), evidence).values()], [conditions, evidence, opportunity.id]);
  const references = conditionReferenceIndex(accounts, [opportunity], evidence);
  const accepted = (result: CommandResult<CommercialCondition>) => {
    setMessage(result.ok ? result.warning || 'Saved in this browser. Account sync runs when connected.' : result.error);
    return result.ok;
  };
  const choices = evidence.filter(e => (e.accountId === accountId || (!e.accountId && e.opportunityId === opportunity.id && Boolean(accountId))) && (!e.opportunityId || e.opportunityId === opportunity.id));
  const activeReadings = readings.filter(r => r.condition.lifecycle === 'active');
  const retired = readings.filter(r => r.condition.lifecycle === 'retired');
  const requirementReadings=useMemo(()=>projectOutcomeRequirements(requirements.filter(r=>r.opportunityId===opportunity.id && r.lifecycle==='active'),conditions,evidence),[requirements,conditions,evidence,opportunity.id]);
  const buyerProgress=useMemo(()=>deriveBuyerProgress({opportunities:[opportunity],commitments,events,evidence,requirementReadings,activities,includeSampleRecords:sampleDataActive}).get(opportunity.id),[opportunity,commitments,events,evidence,requirementReadings,activities,sampleDataActive]);
  const forecast=useMemo(()=>deriveForecastDefensibility({opportunity,requirements,conditions,evidence,dependencies,
    timingAssertions:timing,commitments,today:todayDateKey(),calculatedAt:new Date().toISOString()}),
    [opportunity,requirements,conditions,evidence,dependencies,timing,commitments]);
  const money=useMemo(()=>deriveMoneyConsequences({opportunities:[opportunity],quotes,gates:moneyGates.filter(g=>g.opportunityId===opportunity.id),
    requirements,conditions,evidence,dependencies,timingAssertions:timing,commitments,today:todayDateKey(),calculatedAt:new Date().toISOString()}),
    [opportunity,quotes,moneyGates,requirements,conditions,evidence,dependencies,timing,commitments]);
  return <section aria-label="Commercial state" className="mt-5 rounded-panel border border-line bg-white p-4">
    <ForecastDefensibilitySection view={forecast} lastBuyerProgress={buyerProgress?.last} />
    <MoneyConsequenceSection opportunity={opportunity} requirements={requirements} quotes={quotes} gates={moneyGates}
      projection={money} scope={scope} onMessage={setMessage} />
    <WhatIfScenarioPanel opportunity={opportunity} requirements={requirements} conditions={conditions} evidence={evidence}
      dependencies={dependencies} timingAssertions={timing} commitments={commitments} moneyGates={moneyGates} quotes={quotes} />
    <CommercialDecisionSection opportunity={opportunity} forecast={forecast} commitments={commitments} userId={userId} sampleDataActive={sampleDataActive} />
    <RequirementSection opportunity={opportunity} accounts={accounts} userId={userId} sampleDataActive={sampleDataActive}
      conditions={conditions} evidence={evidence} requirements={requirements} dependencies={dependencies} onMessage={setMessage} />
    <CommercialTimingSection opportunity={opportunity} requirements={requirements} conditions={conditions} evidence={evidence} dependencies={dependencies} commitments={commitments} assertions={timing} userId={userId} sampleDataActive={sampleDataActive} onMessage={setMessage} />
    <div className="mb-5 border-b border-line pb-5" aria-label="Buyer progress"><h3 className="text-sm font-semibold text-ink">Buyer progress</h3>
      <p className="mt-1 text-xs text-muted">Customer actions explicitly recorded in Memoire. This is observed progress, not a deal score.</p>
      {buyerProgress?.signals.length ? <ul className="mt-2 space-y-2">{buyerProgress.signals.slice(0,5).map(signal=><li key={signal.id} className="text-sm"><strong>{signal.summary}</strong><span className="block text-xs text-muted">{displayDate(signal.occurredAt)} · {signal.reason} · Source: {signal.sourceRecordType}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">No qualifying customer action in the available records. Older or unattributed evidence may exist.</p>}
      <p className="mt-2 text-xs text-muted">Seller activity recorded: {buyerProgress?.recordedActivityCount||0}{buyerProgress?.lastRecordedActivityAt?` · last ${displayDate(buyerProgress.lastRecordedActivityAt)}`:''}. Activity alone does not establish buyer progress.</p>
      <button type="button" className="mt-3 text-sm font-semibold text-brand-blue" onClick={()=>setShowEvidenceForm(!showEvidenceForm)}>{showEvidenceForm?'Cancel evidence':'Record technical evidence'}</button>
      {showEvidenceForm && <div className="mt-3 space-y-2 rounded-lg border border-line p-3"><p className="text-xs text-muted">Evidence becomes buyer progress only when explicitly customer-provided, linked to a condition, and that condition resolves an outcome requirement.</p>
        <label className="block text-sm">What was observed?<textarea className={inputClass} maxLength={2000} value={evidenceText} onChange={e=>setEvidenceText(e.target.value)} /></label>
        <label className="block text-sm">Observation date<input type="date" className={inputClass} value={observedAt} onChange={e=>setObservedAt(e.target.value)} /></label>
        <label className="block text-sm">Who supplied this evidence?<select className={inputClass} value={providedBy} onChange={e=>setProvidedBy(e.target.value as typeof providedBy)}><option value="">Choose explicitly</option><option value="customer">Customer</option><option value="self">Seller</option><option value="internal">Internal team</option></select></label>
        <button type="button" disabled={!evidenceText.trim()||!observedAt||!providedBy} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>{const result=recordCommercialEvidence(scope,{accountName:opportunity.accountName,accountId:opportunity.accountId||'',opportunityId:opportunity.id,category:'technical_outcome',direction:'neutral',summary:evidenceText.trim().slice(0,120),evidenceText,observedAt,providedBy:providedBy||null,sourceType:'manual'});setMessage(result.ok?result.warning||'Evidence recorded. Link it to a condition to support an outcome.':result.error);if(result.ok){setShowEvidenceForm(false);setEvidenceText('');setObservedAt('');setProvidedBy('');}}}>Record evidence</button>
      </div>}
    </div>
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
function MoneyConsequenceSection({opportunity,requirements,quotes,gates,projection,scope,onMessage}:{
  opportunity:CrmLiteOpportunity;requirements:OutcomeRequirement[];quotes:QuoteRecord[];gates:CommercialMoneyGate[];
  projection:ReturnType<typeof deriveMoneyConsequences>;scope:CommercialScope;onMessage:(message:string)=>void;
}){
  const [adding,setAdding]=useState(false),[requirementId,setRequirementId]=useState(''),[basis,setBasis]=useState('');
  const [sourceChoice,setSourceChoice]=useState(`opportunity_value:${opportunity.id}`);
  const [basisKind,setBasisKind]=useState<MoneyGateBasisKind>('operator_confirmed_structure');
  useEffect(()=>{if((typeof opportunity.estimatedValue!=='number'||opportunity.status!=='Active')&&sourceChoice.startsWith('opportunity_value:')){
    const quote=quotes.find(row=>typeof row.amount==='number'&&['Sent','Revised','Accepted'].includes(row.status)&&row.paymentStatus!=='Paid');
    if(quote)setSourceChoice(`quote_value:${quote.id}`);
  }},[opportunity.estimatedValue,opportunity.status,quotes,sourceChoice]);
  const activeRequirements=requirements.filter(row=>row.opportunityId===opportunity.id&&row.lifecycle==='active');
  const active=gates.filter(row=>row.opportunityId===opportunity.id&&row.lifecycle==='active');
  const refs={opportunities:[opportunity],quotes,requirements};
  return <div className="mb-5 border-b border-line pb-5" aria-label="Money consequence">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">Money consequence</h3>
      <p className="mt-1 text-xs text-muted">Recorded value stays context until you explicitly confirm what commercial outcome it depends on.</p></div>
      {((opportunity.status==='Active'&&typeof opportunity.estimatedValue==='number')||quotes.some(row=>typeof row.amount==='number'&&['Sent','Revised','Accepted'].includes(row.status)&&row.paymentStatus!=='Paid'))&&activeRequirements.length>0&&<button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>setAdding(!adding)}>{adding?'Cancel':'This value depends on…'}</button>}
    </div>
    {typeof opportunity.estimatedValue==='number'&&<p className="mt-2 text-sm"><strong>{opportunity.estimatedValue.toLocaleString()} {opportunity.currency}</strong> · Opportunity potential value</p>}
    {!active.length&&projection.contexts[0]?.blockerLabels.length>0&&<p className="mt-2 text-sm text-muted">Current known blocker: {projection.contexts[0].blockerLabels.join('; ')}. No Money Gate is recorded, so the value is not attributed to this blocker.</p>}
    {projection.consequences.map(row=><div key={row.moneySourceId} className="mt-3 rounded-lg border border-line p-3 text-sm">
      {row.blockers.length?<><p><strong>Currently waiting on:</strong> {row.blockers.map(blocker=>blocker.label).join('; ')}</p>
        {row.blockers.map(blocker=>blocker.paths.map((path,index)=><p key={`${blocker.requirementId}:${index}`} className="mt-1 text-xs text-muted">Path: {path.requirementIds.map(id=>requirements.find(r=>r.id===id)?.expectedOutcome||id).join(' → ')}</p>))}</>:<p>No current blocker on the recorded gate. This does not mean the value is realized.</p>}
      {row.timingState==='unsupported'&&<p className="mt-1 text-amber-800">The linked commercial target timing is no longer supported.</p>}
    </div>)}
    {adding&&<div className="mt-3 space-y-2 rounded-lg border border-line p-3">
      <label className="block text-sm">Money source<select className={inputClass} value={sourceChoice} onChange={event=>setSourceChoice(event.target.value)}>{opportunity.status==='Active'&&typeof opportunity.estimatedValue==='number'&&<option value={`opportunity_value:${opportunity.id}`}>Opportunity potential value · {opportunity.estimatedValue.toLocaleString()} {opportunity.currency}</option>}{quotes.filter(row=>typeof row.amount==='number'&&['Sent','Revised','Accepted'].includes(row.status)&&row.paymentStatus!=='Paid').map(row=><option key={row.id} value={`quote_value:${row.id}`}>Quote {row.quoteId} · {row.amount!.toLocaleString()} {row.currency}</option>)}</select></label>
      <label className="block text-sm">Required commercial outcome<select className={inputClass} value={requirementId} onChange={event=>setRequirementId(event.target.value)}><option value="">Choose a Requirement</option>{activeRequirements.map(row=><option key={row.id} value={row.id}>{row.expectedOutcome}</option>)}</select></label>
      <label className="block text-sm">Basis<select className={inputClass} value={basisKind} onChange={event=>setBasisKind(event.target.value as MoneyGateBasisKind)}><option value="operator_confirmed_structure">Operator-confirmed commercial structure</option><option value="customer_process">Customer process</option><option value="contractual_requirement">Contractual requirement</option></select></label>
      <label className="block text-sm">Why does this value depend on that outcome?<textarea className={inputClass} maxLength={1000} value={basis} onChange={event=>setBasis(event.target.value)} /></label>
      <button type="button" disabled={!sourceChoice||!requirementId||!basis.trim()} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>{const separator=sourceChoice.indexOf(':');const moneySourceType=sourceChoice.slice(0,separator) as 'opportunity_value'|'quote_value';const moneySourceId=sourceChoice.slice(separator+1);const result=createCommercialMoneyGate(scope,{opportunityId:opportunity.id,moneySourceType,moneySourceId,requirementId,basisKind,basis},refs);onMessage(result.ok?result.warning||'Money Gate recorded.':result.error);if(result.ok){setAdding(false);setRequirementId('');setBasis('');}}}>Confirm relationship</button>
    </div>}
    {active.map(gate=><p key={gate.id} className="mt-2 text-xs text-muted">Linked to {requirements.find(row=>row.id===gate.requirementId)?.expectedOutcome||'Requirement'} · {gate.basis}<button type="button" className="ml-2 text-brand-blue" onClick={()=>{const result=retireCommercialMoneyGate(scope,gate.id,gate.updatedAt,refs);onMessage(result.ok?result.warning||'Money Gate retired.':result.error);}}>Retire</button></p>)}
  </div>;
}

const roleLabel: Record<RequirementRole,string> = { required_now:'Required now',required_later:'Required later',context:'Context' };
function RequirementSection({opportunity,accounts,userId,sampleDataActive,conditions,evidence,requirements,dependencies,onMessage}:{
  opportunity:CrmLiteOpportunity;accounts:AccountMemoryRecord[];userId?:string;sampleDataActive:boolean;
  conditions:CommercialCondition[];evidence:CommercialEvidence[];requirements:OutcomeRequirement[];dependencies:CommercialDependency[];onMessage:(message:string)=>void;
}) {
  const [adding,setAdding]=useState(false); const [accountId,setAccountId]=useState(opportunity.accountId || '');
  const [expectedOutcome,setExpectedOutcome]=useState(''); const [question,setQuestion]=useState('');
  const [role,setRole]=useState<RequirementRole>('required_now'); const [conditionId,setConditionId]=useState('');
  const [dependentId,setDependentId]=useState('');const [prerequisiteId,setPrerequisiteId]=useState('');const [basis,setBasis]=useState('');
  const scope:CommercialScope={userId:userId || null,sampleDataActive};
  const refs=()=>requirementReferenceIndex(accounts,[opportunity],loadCommercialConditions());
  const accept=(result:CommandResult<OutcomeRequirement>)=>{onMessage(result.ok ? result.warning || 'Requirement saved.' : result.error);return result.ok;};
  const active=requirements.filter(r=>r.opportunityId===opportunity.id && r.lifecycle==='active');
  const retired=requirements.filter(r=>r.opportunityId===opportunity.id && r.lifecycle==='retired');
  const readings=projectOutcomeRequirements(requirements.filter(r=>r.opportunityId===opportunity.id),conditions,evidence);
  const known=deriveKnownBlockers(opportunity.id,readings,dependencies.filter(d=>d.opportunityId===opportunity.id));
  const next=known.integrity==='valid'?nextBestQuestion(known.blockers.map(b=>b.reading)):null;
  const nextBlocker=known.blockers.find(b=>b.reading.requirement.id===next?.requirement.id);
  const byId=new Map(active.map(r=>[r.id,r]));
  const activeDependencies=dependencies.filter(d=>d.opportunityId===opportunity.id && d.lifecycle==='active');
  const retiredDependencies=dependencies.filter(d=>d.opportunityId===opportunity.id && d.lifecycle==='retired');
  const choices=conditions.filter(c=>c.lifecycle==='active' && c.accountId===accountId && (!c.opportunityId || c.opportunityId===opportunity.id));
  return <div className="mb-5 border-b border-line pb-5" aria-label="Outcome requirements">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Outcome requirements</h3>
      <button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>setAdding(!adding)}>{adding?'Cancel':'Add requirement'}</button></div>
    <p className="mt-1 text-xs text-muted">Record what this opportunity needs to establish. A missing answer stays unknown until you link a real proposition.</p>
    {known.integrity!=='valid' && <p role="alert" className="mt-2 text-sm text-amber-700">Prerequisite records need repair ({known.integrity}). Waiting For and the next question are paused so an incorrect path is not shown.</p>}
    {known.integrity==='valid' && known.blockers.length>0 && <div className="mt-3 rounded-lg border border-line p-3 text-sm" aria-label="Waiting For"><p className="font-semibold">Waiting For · {known.blockers.length} known blocker{known.blockers.length===1?'':'s'}</p>
      <ul className="mt-2 space-y-2">{known.blockers.map(blocker=><li key={blocker.reading.requirement.id}><strong>{blocker.reading.requirement.expectedOutcome}</strong><span className="block text-xs text-muted">{blocker.reading.resolution} · {blocker.paths.map(path=>path.requirementIds.map(id=>byId.get(id)?.expectedOutcome||id).join(' → ')).join('; ')}</span></li>)}</ul>
      <p className="mt-2 text-xs text-muted">Only prerequisites explicitly recorded here are included. Other real-world blockers may exist.</p></div>}
    {next && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Next question · {roleLabel[next.requirement.role]}</p>
      <p className="mt-1">{requirementQuestion(next)}</p><p className="mt-1 text-xs text-muted">{next.conditionState==='contradicted'?'Conflicting current evidence':next.conditionState==='unknown'?'No answer recorded':next.conditionState==='assumed'?'Operating assumption':'Still being tested'} · {next.requirement.expectedOutcome}</p>
      {nextBlocker?.paths.some(path=>path.dependencyIds.length>0) && <p className="mt-1 text-xs text-muted">Prerequisite path: {nextBlocker.paths[0].requirementIds.map(id=>byId.get(id)?.expectedOutcome||id).join(' → ')}. {nextBlocker.paths[0].explanations.join(' · ')}</p>}
      <p className="mt-1 text-xs text-muted">Based on this recorded requirement{next.condition?', its linked condition':''}{next.sourceEvidenceIds.length?' and current evidence':''}.</p></div>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Prerequisites ({activeDependencies.length})</summary>
      <p className="mt-2 text-xs text-muted">Confirm only a hard requirement: the dependent outcome cannot be completed until this prerequisite is resolved.</p>
      {activeDependencies.map(edge=><div key={edge.id} className="mt-2 rounded-lg border border-line p-2"><p>{byId.get(edge.dependentRequirementId)?.expectedOutcome||'Retired outcome'} requires {byId.get(edge.prerequisiteRequirementId)?.expectedOutcome||'Retired prerequisite'}</p><p className="mt-1 text-xs text-muted">Why: {edge.basis} · Added manually {displayDate(edge.createdAt)}</p><button type="button" className="mt-1 text-xs text-brand-blue" onClick={()=>{const result=retireCommercialDependency(scope,edge.id,edge.updatedAt,requirements);onMessage(result.ok?result.warning||'Prerequisite retired.':result.error);}}>Retire prerequisite</button></div>)}
      {active.length>1 && <div className="mt-3 space-y-2 rounded-lg border border-line p-3"><label className="block">Outcome that depends on another<select className={inputClass} value={dependentId} onChange={e=>setDependentId(e.target.value)}><option value="">Choose outcome</option>{active.map(r=><option key={r.id} value={r.id}>{r.expectedOutcome}</option>)}</select></label>
        <label className="block">Required first<select className={inputClass} value={prerequisiteId} onChange={e=>setPrerequisiteId(e.target.value)}><option value="">Choose prerequisite</option>{active.filter(r=>r.id!==dependentId).map(r=><option key={r.id} value={r.id}>{r.expectedOutcome}</option>)}</select></label>
        <label className="block">Why is this a hard prerequisite?<textarea className={inputClass} maxLength={1000} value={basis} onChange={e=>setBasis(e.target.value)} /></label>
        <button type="button" disabled={!dependentId||!prerequisiteId||!basis.trim()} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>{const result=createCommercialDependency(scope,{opportunityId:opportunity.id,dependentRequirementId:dependentId,prerequisiteRequirementId:prerequisiteId,basis},requirements);onMessage(result.ok?result.warning||'Prerequisite recorded.':result.error);if(result.ok){setDependentId('');setPrerequisiteId('');setBasis('');}}}>Confirm prerequisite</button></div>}
      {retiredDependencies.length>0 && <details className="mt-3"><summary>Retired prerequisites ({retiredDependencies.length})</summary>{retiredDependencies.map(edge=><p key={edge.id} className="mt-2 text-xs text-muted">{requirements.find(r=>r.id===edge.dependentRequirementId)?.expectedOutcome||'Unavailable outcome'} required {requirements.find(r=>r.id===edge.prerequisiteRequirementId)?.expectedOutcome||'Unavailable prerequisite'} · {edge.basis}</p>)}</details>}
    </details>
    {!active.length && <p className="mt-3 text-sm text-muted">No outcome requirements recorded for this opportunity.</p>}
    {readings.filter(reading=>reading.requirement.lifecycle==='active').map(reading=><RequirementRow key={reading.requirement.id} reading={reading} conditions={conditions} evidence={evidence}
      onChange={change=>accept(changeOutcomeRequirement(scope,reading.requirement.id,reading.requirement.updatedAt,change,refs()))}
      onAnswer={(statement,intent,evidenceId,assessment)=>{
        const c=createCommercialCondition(scope,{accountId:reading.requirement.accountId,opportunityId:opportunity.id,
          statement,conditionCategory:'decision',intent,validFrom:null,...(evidenceId?{evidence:{evidenceId,assessment}}:{})},
          conditionReferenceIndex(accounts,[opportunity],loadCommercialEvidence()));
        if (!c.ok) {onMessage(c.error);return false;}
        if (c.warning) onMessage(c.warning);
        return accept(changeOutcomeRequirement(scope,reading.requirement.id,reading.requirement.updatedAt,{kind:'link',conditionId:c.value.id},refs()));
      }} />)}
    {retired.length>0 && <details className="mt-3 text-sm"><summary>Retired requirements ({retired.length})</summary>{retired.map(r=><p key={r.id} className="mt-2 text-muted">{r.expectedOutcome}</p>)}</details>}
    {adding && <div className="mt-4 space-y-3 border-t border-line pt-3">
      <label className="block text-sm">Account<select className={inputClass} value={accountId} onChange={e=>{setAccountId(e.target.value);setConditionId('');}}><option value="">Choose account</option>{accounts.filter(a=>Boolean(a.isSample || a.source==='demo')===sampleDataActive && (!opportunity.accountId || a.id===opportunity.accountId)).map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></label>
      <label className="block text-sm">Required outcome or knowledge<textarea className={inputClass} maxLength={1000} value={expectedOutcome} onChange={e=>setExpectedOutcome(e.target.value)} placeholder="For example: Know who gives final financial approval" /></label>
      <label className="block text-sm">Question to ask (optional)<input className={inputClass} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Who gives final financial approval?" /></label>
      <label className="block text-sm">Role<select className={inputClass} value={role} onChange={e=>setRole(e.target.value as RequirementRole)}>{requirementRoles.map(r=><option key={r} value={r}>{roleLabel[r]}</option>)}</select></label>
      <label className="block text-sm">Existing condition (optional)<select className={inputClass} value={conditionId} onChange={e=>setConditionId(e.target.value)}><option value="">No answer recorded yet</option>{choices.map(c=><option key={c.id} value={c.id}>{c.statement}</option>)}</select></label>
      <button type="button" disabled={!accountId || !expectedOutcome.trim()} className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={()=>{
        if(accept(createOutcomeRequirement(scope,{accountId,opportunityId:opportunity.id,expectedOutcome,question,role,conditionId},refs()))) {setAdding(false);setExpectedOutcome('');setQuestion('');setConditionId('');}
      }}>Record requirement</button>
    </div>}
  </div>;
}
export function RequirementRow({reading,conditions,evidence,onChange,onAnswer}:{reading:ReturnType<typeof projectOutcomeRequirements>[number];conditions:CommercialCondition[];evidence:CommercialEvidence[];
  onChange:(change:Parameters<typeof changeOutcomeRequirement>[3])=>boolean;
  onAnswer:(statement:string,intent:ConditionIntent,evidenceId:string,assessment:ConditionEvidenceLink['assessment'])=>boolean;
}) {
  const [answering,setAnswering]=useState(false);const [statement,setStatement]=useState('');const [intent,setIntent]=useState<ConditionIntent>('hypothesis');
  const [evidenceId,setEvidenceId]=useState('');const [assessment,setAssessment]=useState<ConditionEvidenceLink['assessment']>('supports');
  const r=reading.requirement;
  const choices=conditions.filter(c=>c.lifecycle==='active' && c.accountId===r.accountId && (!c.opportunityId || c.opportunityId===r.opportunityId) && c.id!==r.conditionId);
  const evidenceChoices=evidence.filter(e=>(e.accountId===r.accountId || (!e.accountId && e.opportunityId===r.opportunityId)) && (!e.opportunityId || e.opportunityId===r.opportunityId));
  return <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm"><strong className="mr-2">{roleLabel[r.role]} · {reading.resolution}</strong>{r.expectedOutcome}</summary>
    <p className="mt-2 text-sm">{requirementQuestion(reading)}</p><p className="mt-1 text-xs text-muted">Condition: {reading.condition?.statement || 'None'} · State: {reading.conditionState} · Source: {r.sourceType}</p>
    {reading.sourceEvidenceIds.length>0 && <p className="mt-1 text-xs text-muted">Current evidence: {reading.sourceEvidenceIds.join(', ')}</p>}
    <div className="mt-3 space-y-3"><label className="block text-sm">Role<select className={inputClass} value={r.role} onChange={e=>onChange({kind:'role',role:e.target.value as RequirementRole})}>{requirementRoles.map(role=><option key={role} value={role}>{roleLabel[role]}</option>)}</select></label>
      <label className="block text-sm">Link an existing condition<select className={inputClass} value="" onChange={e=>{if(e.target.value) onChange({kind:'link',conditionId:e.target.value});}}><option value="">Choose a real proposition</option>{choices.map(c=><option key={c.id} value={c.id}>{c.statement}</option>)}</select></label>
      <button type="button" className="mr-4 text-sm text-brand-blue" onClick={()=>setAnswering(!answering)}>{answering?'Cancel answer':'Record answer as a condition'}</button>
      <button type="button" className="text-sm text-muted" onClick={()=>onChange({kind:'retire'})}>Retire requirement</button>
      {answering && <div className="space-y-2 rounded-lg border border-line p-3"><label className="block text-sm">What is the actual proposition?<textarea className={inputClass} maxLength={1000} value={statement} onChange={e=>setStatement(e.target.value)} /></label>
        <label className="block text-sm">Without supporting evidence, treat as<select className={inputClass} value={intent} onChange={e=>setIntent(e.target.value as ConditionIntent)}>{Object.entries(intentLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm">Existing evidence (optional)<select className={inputClass} value={evidenceId} onChange={e=>setEvidenceId(e.target.value)}><option value="">No evidence linked</option>{evidenceChoices.map(e=><option key={e.id} value={e.id}>{e.summary} · {e.observedAt}</option>)}</select></label>
        {evidenceId && <EvidenceAssessment value={assessment} onChange={setAssessment} />}
        <button type="button" disabled={!statement.trim()} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>{if(onAnswer(statement,intent,evidenceId,assessment)){setAnswering(false);setStatement('');setEvidenceId('');}}}>Record answer and link</button>
      </div>}
    </div>
  </details>;
}
