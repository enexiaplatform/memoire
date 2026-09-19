import type { ForecastDefensibility } from '../../domain/commercialKernel/deriveForecastDefensibility';

const labels:Record<ForecastDefensibility['verdict'],string>={no_claim:'No dated close claim',insufficient_basis:'Insufficient recorded basis',
  defensible:'Supported within recorded scope',conditional:'Conditional',incomplete:'Incomplete',
  not_currently_supported:'Not currently supported'};

/** The current argument only. Operator forecast labels and statistical
 * calibration remain elsewhere and are never changed by this projection. */
export function ForecastDefensibilitySection({view,lastBuyerProgress}:{view:ForecastDefensibility;lastBuyerProgress?:{summary:string;occurredAt:string}|null}){
  return <section aria-label="Forecast defensibility" className="mb-5 border-b border-line pb-5">
    <h3 className="text-sm font-semibold text-ink">Forecast defensibility</h3>
    <p className="mt-1 text-xs text-muted">What would have to be true for the recorded close target to hold? This reads only recorded commercial premises; it does not estimate a win probability.</p>
    {!view.claim?<p className="mt-3 text-sm">No dated close claim to evaluate.</p>:<>
      <p className="mt-3 text-sm"><strong>{labels[view.verdict]}</strong> · Close target {view.claim.targetDate} · Operator forecast evidence: {view.claim.operatorCategory}</p>
      <p className="mt-1 text-xs text-muted">Based on {view.coverage.modeledPremiseCount} recorded premise(s): {view.coverage.requiredNowCount} required now, {view.coverage.linkedLaterCount} linked later. {view.coverage.unscopedLaterCount?`${view.coverage.unscopedLaterCount} later outcome(s) have no recorded path to this target. `:''}Recorded Requirements are not assumed exhaustive.</p>
      {view.categoryDisagreement&&<p className="mt-2 text-sm text-amber-800">The operator's “{view.claim.operatorCategory}” label and the current recorded argument differ. Review the basis; neither label was changed.</p>}
      <p className="mt-2 text-sm">Timing: {view.timingEvaluation.replaceAll('_',' ')}{view.timing?.lastSafeDate?` · Last safe blocker date ${view.timing.lastSafeDate}`:''}{view.timing?.bufferDays!==null&&view.timing?.bufferDays!==undefined?` · Promise buffer ${view.timing.bufferDays} days`:''}</p>
      {view.timing?.assumptionsUsed&&<p className="mt-1 text-xs text-amber-800">Timing uses explicit planning assumptions.</p>}
      {view.blockers.length>0&&<p className="mt-2 text-sm">Current known blocker(s): {view.blockers.map(b=>b.expectedOutcome).join('; ')}.</p>}
      {view.nextQuestion&&<p className="mt-2 text-sm"><strong>Next question:</strong> {view.nextQuestion.question}</p>}
      {lastBuyerProgress&&<p className="mt-2 text-xs text-muted">Last observed buyer progress: {lastBuyerProgress.summary} · {lastBuyerProgress.occurredAt.slice(0,10)}. Context only; it does not determine this reading.</p>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand-blue">Why this reading?</summary>
        {view.premises.length?<ul className="mt-2 space-y-1">{view.premises.map(p=><li key={p.requirementId}>
          <strong>{p.state}{p.blocked?' · blocked upstream':''}</strong> · {p.expectedOutcome}
          {p.conditionStatement&&<span className="block text-xs text-muted">Proposition: {p.conditionStatement}</span>}
          <span className="block text-xs text-muted">Requirement {p.requirementId}{p.conditionId?` · Condition ${p.conditionId}`:''}</span>
          {p.evidenceSources.map(source=><span key={source.id} className="block text-xs text-muted">Evidence {source.assessment}: {source.summary} · {source.id}</span>)}
        </li>)}</ul>:<p className="mt-2 text-muted">No required-now outcomes have been recorded for this close claim.</p>}
        {view.blockers.map(b=><p key={b.requirementId} className="mt-2 text-xs text-muted">Blocker path: {b.paths.map(p=>p.requirementIds.join(' → ')).join(' / ')} · Dependency sources: {b.paths.flatMap(p=>p.dependencyIds).join(', ')||'none'}</p>)}
        {view.timing&&<div className="mt-2 text-xs text-muted"><p>Target {view.timing.targetDate||'unknown'} · Latest safe {view.timing.lastSafeDate||'unknown'} · Calculated {view.calculatedAt.slice(0,16)} UTC</p>
          {view.timing.timingSources.map(s=><p key={s.id}>{s.durationDays} {s.durationUnit?.replaceAll('_',' ')} for {s.requirementId} · {s.epistemic} · {s.sourceKind?.replaceAll('_',' ')} · {s.sourceReference||s.basis} · Source {s.id}</p>)}
          {view.timing.unknownTimingSegments.map(s=><p key={s}>Unknown: {s}</p>)}
          {view.timing.conflictingTimingSegments.map(s=><p key={s}>Conflict: {s}</p>)}
        </div>}
      </details>
      {view.whatWouldHaveToBeTrue.length>0&&<div className="mt-3 rounded-lg border border-line p-3 text-sm"><strong>What would have to be true?</strong>
        <ul className="mt-2 list-disc space-y-1 pl-5">{view.whatWouldHaveToBeTrue.map((need,i)=><li key={`${need.kind}-${i}`}>{need.text}</li>)}</ul>
      </div>}
    </>}
  </section>;
}
