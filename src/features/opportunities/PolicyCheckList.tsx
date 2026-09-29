import type {PolicyCheck} from '../../domain/commercialKernel/commercialPolicy.ts';
const statusLabel={satisfied:'Requirement met',breached:'Rule unmet',unknown:'Cannot determine',not_applicable:'Does not apply'};
export function PolicyCheckList({checks}:{checks:PolicyCheck[]}){
  return <ul className="mt-3 space-y-3">{checks.map(check=><li key={check.policy.id} className="rounded-lg border border-line p-3 text-sm">
    <p><strong>{check.policy.title}</strong> · Version {check.policy.version}</p>
    <p className="mt-1 font-semibold">{statusLabel[check.status]}</p><p className="text-muted">{check.reason}</p>
    <p className="mt-1">Requires: {check.requirement?.expectedOutcome||check.policy.requirementId}</p>
    <p className="mt-1 text-xs text-muted">{check.policy.appliesWhen==='always'?'Applies to this Opportunity':`Applies above ${check.policy.amount?.toLocaleString()} ${check.policy.currency}`} · {check.policy.rationale}</p>
    <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Rule and source references</summary>
      <p className="mt-1 break-words">{check.sourceRecordIds.join(' · ')}</p><p>Published {new Date(check.policy.updatedAt).toLocaleString()}</p></details>
  </li>)}</ul>;
}
