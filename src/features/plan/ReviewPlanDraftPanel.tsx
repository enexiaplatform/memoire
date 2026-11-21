import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { guardLocalWorkspaceScope } from '../../services/localWorkspaceOwner';
import { loadPlanItems, loadPlanItemsForWorkspace } from '../../services/planItemStore';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { formatSafeBusinessDate, isValidBusinessDate } from '../../utils/safeDate';
import { matchingReviewPlanItem, type ReviewPlanHandoff } from '../../utils/reviewPlanDraft';
import { createPersonalPlanRecord, splitBracketTag, type PlanRecord } from '../../utils/weeklyPlan';
import type { RankedRecommendation } from '../../domain/commercialKernel/rankRecommendations';
import { resolveCommercialThreads } from '../../domain/commercialKernel/deriveThreads';
import { mergePlanCommitments } from '../../domain/commercialKernel/derivePlanCommitments';
import { indexCommercialReviewSources } from '../threads/commercialReviewSources';

const review = '/app/reviews';
const plan = (date: string) => `/app/timeline?view=upcoming&date=${encodeURIComponent(date)}`;

export function ReviewPlanDraftPanel({
  origin, date, scope, ownerId, workspaceName, proposal, sources, loading, unavailable, records, onSave, retry,
}: {
  origin: ReviewPlanHandoff;
  date: string;
  scope: string;
  ownerId?: string;
  workspaceName: string;
  proposal?: RankedRecommendation;
  sources?: ReadonlyMap<string, string | null>;
  loading: boolean;
  unavailable: boolean;
  records: readonly PlanRecord[];
  onSave: (ownerId: string, record: PlanRecord) => Promise<boolean>;
  retry: () => void;
}) {
  const navigate = useNavigate();
  const wrongScope = !ownerId || origin.scope !== scope;
  const citations = origin.sourceRecordIds.map(id => sources?.get(id));
  const eligible = Boolean(proposal?.accountName && (proposal.threadId || proposal.opportunityId || proposal.commitmentId));
  const stale = !eligible || citations.some(label => typeof label !== 'string')
    || proposal?.sourceRecordIds.some(id => !origin.sourceRecordIds.includes(id))
    || origin.sourceRecordIds.some(id => !proposal?.sourceRecordIds.includes(id));
  const [editedLabel, setEditedLabel] = useState<string | undefined>();
  const [draftDate, setDraftDate] = useState(date);
  const [saving, setSaving] = useState(false);
  const [changedEvidence, setChangedEvidence] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const label = editedLabel ?? (eligible ? proposal?.candidateAction || proposal?.recommendedAction || '' : '');
  const parsed = splitBracketTag(label);
  const candidate = {
    date: draftDate,
    label: parsed.label, tag: parsed.tag || proposal?.accountName || '',
    linkedAccountName: proposal?.accountName, linkedOpportunityId: proposal?.opportunityId || undefined,
    reviewProposal: { proposalId: origin.proposalId, sourceRecordIds: origin.sourceRecordIds },
  };
  const duplicate = matchingReviewPlanItem(records, candidate, false);

  const save = async () => {
    if (inFlight.current || !ownerId || wrongScope || loading || unavailable || stale || changedEvidence || duplicate
        || !candidate.label.trim() || !isValidBusinessDate(draftDate)) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const assertCurrent = guardLocalWorkspaceScope(ownerId);
      const [hash, workspace, latestPlan] = await Promise.all([
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(origin.proposalId)),
        loadSalesWorkspaceData(ownerId, { force: true, waitForCloud: true }),
        loadPlanItemsForWorkspace(ownerId),
      ]);
      if (!mounted.current) return;
      assertCurrent();
      const commitments = mergePlanCommitments(workspace.commitments, {
        activities: workspace.activities, planItems: latestPlan, includeSampleRecords: false,
      });
      const threads = resolveCommercialThreads({
        storedThreads: workspace.threads, opportunities: workspace.opportunities,
        activities: workspace.activities, quotes: workspace.quotes, commitments,
      });
      const latestSources = indexCommercialReviewSources(workspace, threads, commitments, false);
      if (origin.sourceRecordIds.some(id => typeof latestSources.get(id) !== 'string')) {
        setChangedEvidence(true);
        return;
      }
      const record = {
        ...createPersonalPlanRecord({ ...candidate, label, source: 'user' }),
        id: 'review-plan-' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''),
        reviewProposal: candidate.reviewProposal,
      };
      if (matchingReviewPlanItem([...latestPlan, ...loadPlanItems()], record, false)) {
        setError('A matching Plan item appeared. Open Plan to review it before saving.');
        return;
      }
      const saved = await onSave(ownerId, record);
      if (!mounted.current) return;
      assertCurrent();
      if (!saved) {
        setError('This proposal already has a Plan item. Open Plan to review the saved item.');
        return;
      }
      navigate(plan(draftDate), { replace: true });
    } catch {
      if (mounted.current) setError('Could not save this draft. Your edits are still here.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <section aria-label="Review follow-up draft" className="space-y-3 rounded-panel bg-white p-4 shadow-panel sm:p-5">
      <h2 className="text-lg font-semibold text-ink">Review follow-up draft</h2>
      {wrongScope ? <p role="alert">This draft belongs to another workspace. Switch back to the originating workspace and reopen it from Review.</p>
        : loading ? <p role="status">Checking the proposal and Plan items…</p>
        : unavailable ? <><p role="alert">The proposal evidence is unavailable. Your draft is still open.</p>
          <button type="button" className="min-h-11 font-semibold text-brand-blue underline" onClick={retry}>Retry evidence</button></>
        : stale || changedEvidence ? <p role="alert">The proposal or its source evidence changed. Open Review to choose a current proposal.</p>
        : (
          <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-3">
            <p className="text-sm text-muted">{workspaceName} · Proposed</p>
            <label className="block text-sm font-semibold">Follow-up
              <input autoFocus className="mt-1 block min-h-11 w-full rounded-lg border border-line px-3"
                value={label} maxLength={500} disabled={saving} onChange={event => setEditedLabel(event.target.value)} required />
            </label>
            <label className="block text-sm font-semibold">Plan date
              <input type="date" className="mt-1 block min-h-11 max-w-full rounded-lg border border-line px-3"
                value={draftDate} disabled={saving} onChange={event => setDraftDate(event.target.value)} required />
            </label>
            <div className="text-sm text-muted">
              <p className="font-semibold text-ink">Source evidence</p>
              <ul className="list-disc break-words pl-5">
                {origin.sourceRecordIds.map((id, index) => <li key={id}>{citations[index]}</li>)}
              </ul>
            </div>
            {duplicate && <p role="alert">Possible duplicate: “{duplicate.label}” on {formatSafeBusinessDate(duplicate.date)}.
              {duplicate.reviewProposal?.proposalId === origin.proposalId ? ' This proposal already has a Plan item.' : ' Change the draft or review the existing item.'}
            </p>}
            {duplicate && <Link replace to={plan(duplicate.date)} className="inline-flex min-h-11 items-center font-semibold text-brand-blue underline">Open matching Plan week</Link>}
            {error && <p role="alert">{error}</p>}
            <button type="submit" disabled={saving || Boolean(duplicate) || !candidate.label.trim() || !isValidBusinessDate(draftDate)}
              className="min-h-11 rounded-lg bg-brand-blue px-4 font-semibold text-white disabled:opacity-50">Save to Plan</button>
          </form>
        )}
      {!saving && <nav aria-label="Leave follow-up draft" className="flex flex-wrap gap-x-4 text-sm font-semibold text-brand-blue">
        <Link replace to={plan(date)} className="inline-flex min-h-11 items-center underline">Cancel draft</Link>
        <Link replace to={review} className="inline-flex min-h-11 items-center underline">Back to Review</Link>
      </nav>}
    </section>
  );
}
