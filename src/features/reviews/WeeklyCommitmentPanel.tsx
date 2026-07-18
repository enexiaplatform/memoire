import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Lock, Plus, X } from 'lucide-react';
import type { NextWeekPriority } from '../../utils/weeklyBusinessReview';
import {
  MAX_WEEKLY_COMMITMENTS,
  buildCarryOverSelections,
  buildWeeklyCommitmentSnapshot,
  commitmentResolutionLabel,
  commitmentResolutionTone,
  reconcileWeeklyCommitment,
  resolveCommitmentItem,
  type CommitmentResolution,
  type CommitmentSelection,
  type WeeklyCommitmentSnapshot,
} from '../../utils/weeklyCommitment';
import {
  getWeeklyCommitmentForWeek,
  loadWeeklyCommitmentsForWorkspace,
  saveWeeklyCommitment,
} from '../../services/weeklyCommitmentStore';
import { getCurrentPipelineReviewWeekId } from '../../utils/pipelineReviewHabit';
import { trackProductEvent } from '../../utils/productAnalytics';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';
import type { SalesActivityRecord } from '../../services/salesActivityStore';

/**
 * The one stateful step between what Memoire recommends and what the week
 * actually becomes. Everything above it is derived; this is the only place the
 * user's own choice is written down and frozen.
 */
export function WeeklyCommitmentPanel({
  suggestions,
  activities,
  userId,
  sampleDataActive,
}: {
  suggestions: NextWeekPriority[];
  activities: SalesActivityRecord[];
  userId?: string;
  sampleDataActive: boolean;
}) {
  const [snapshots, setSnapshots] = useState<WeeklyCommitmentSnapshot[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [reconfirming, setReconfirming] = useState(false);

  const weekId = useMemo(() => getCurrentPipelineReviewWeekId(nextWeekDate()), []);
  const period = useMemo(() => weekRangeFor(weekId), [weekId]);
  const currentSnapshot = useMemo(() => getWeeklyCommitmentForWeek(weekId, snapshots), [snapshots, weekId]);
  const priorSnapshot = useMemo(
    () => snapshots.filter((snapshot) => snapshot.weekId < weekId).sort((a, b) => b.weekId.localeCompare(a.weekId)).at(0) || null,
    [snapshots, weekId],
  );

  useEffect(() => {
    let active = true;
    void loadWeeklyCommitmentsForWorkspace(userId, sampleDataActive).then((loaded) => {
      if (active) setSnapshots(loaded);
    });
    return () => { active = false; };
  }, [sampleDataActive, userId]);

  // Carried-over items from the last confirmed week pre-select the next one, so
  // a promise that survives a week is visibly a repeat rather than a fresh idea.
  useEffect(() => {
    if (!priorSnapshot || currentSnapshot) return;
    const carried = buildCarryOverSelections(priorSnapshot);
    if (carried.length > 0) setCustomLabels((existing) => (existing.length > 0 ? existing : carried.map((item) => item.label)));
  }, [currentSnapshot, priorSnapshot]);

  const totalSelected = selectedIds.length + customLabels.length;
  const atCap = totalSelected >= MAX_WEEKLY_COMMITMENTS;

  const toggleSuggestion = useCallback((suggestionId: string) => {
    setSelectedIds((existing) => {
      if (existing.includes(suggestionId)) return existing.filter((id) => id !== suggestionId);
      if (existing.length + customLabels.length >= MAX_WEEKLY_COMMITMENTS) return existing;
      return [...existing, suggestionId];
    });
  }, [customLabels.length]);

  const addCustom = useCallback(() => {
    const label = customDraft.trim();
    if (!label || atCap) return;
    setCustomLabels((existing) => [...existing, label]);
    setCustomDraft('');
    trackProductEvent('weekly_commitment_edited');
  }, [atCap, customDraft]);

  const confirmWeek = useCallback(() => {
    const suggestionSelections: CommitmentSelection[] = selectedIds.flatMap((id) => {
      const suggestion = suggestions.find((item) => item.id === id);
      if (!suggestion) return [];
      return [{
        suggestionId: suggestion.id,
        label: suggestion.label,
        detail: suggestion.detail,
        linkedOpportunityId: suggestion.linkedOpportunityId,
        linkedContextId: suggestion.linkedContextId,
        linkedAccountName: suggestion.linkedAccountName,
      }];
    });
    const customSelections: CommitmentSelection[] = customLabels.map((label) => ({ label }));

    const snapshot = buildWeeklyCommitmentSnapshot({
      weekId,
      periodStart: period.start,
      periodEnd: period.end,
      suggestions,
      selections: [...suggestionSelections, ...customSelections],
      carriedFromWeekId: priorSnapshot?.weekId,
      // Tagged at birth, not at sync time: a commitment confirmed in the demo
      // sandbox must never merge into a live workspace if the same browser
      // later signs in.
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    });

    setSnapshots(saveWeeklyCommitment(snapshot));
    setReconfirming(false);
    trackProductEvent('weekly_commitment_confirmed');
  }, [customLabels, period.end, period.start, priorSnapshot, sampleDataActive, selectedIds, suggestions, weekId]);

  const setResolution = useCallback((snapshot: WeeklyCommitmentSnapshot, itemId: string, resolution: CommitmentResolution) => {
    setSnapshots(saveWeeklyCommitment(resolveCommitmentItem(snapshot, itemId, resolution)));
    trackProductEvent('weekly_commitment_resolved');
  }, []);

  const showPicker = !currentSnapshot || reconfirming;

  return (
    <div className="space-y-3">
      {priorSnapshot && <PlanVsActual snapshot={priorSnapshot} activities={activities} onResolve={setResolution} />}

      {showPicker ? (
        <div>
          <p className="text-xs text-gray-500">
            Pick up to {MAX_WEEKLY_COMMITMENTS}. What you confirm is frozen - editing the deal later will not rewrite it.
          </p>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Nothing suggested yet. Book the next touches, or write your own commitment below.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-xs leading-5">
              {suggestions.map((suggestion) => {
                const checked = selectedIds.includes(suggestion.id);
                return (
                  <li key={suggestion.id}>
                    <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ${checked ? 'bg-blue-50' : 'bg-white'} ${!checked && atCap ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && atCap}
                        onChange={() => toggleSuggestion(suggestion.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                      <span>
                        <span className="font-bold text-gray-900">{suggestion.label}</span>
                        <span className="mt-0.5 block text-gray-600">{suggestion.detail}</span>
                        <span className="mt-0.5 block text-gray-400">Why: {suggestion.reason}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {customLabels.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-xs leading-5">
              {customLabels.map((label, index) => (
                <li key={`${label}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                  <span className="font-bold text-gray-900">{label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => setCustomLabels((existing) => existing.filter((_, itemIndex) => itemIndex !== index))}
                    className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={customDraft}
              onChange={(event) => setCustomDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }}
              disabled={atCap}
              placeholder={atCap ? `${MAX_WEEKLY_COMMITMENTS} is the cap` : 'Add your own commitment'}
              aria-label="Add your own commitment"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={atCap || !customDraft.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirmWeek}
              disabled={totalSelected === 0}
              className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              <Lock className="h-3.5 w-3.5" />
              Confirm the week ({totalSelected}/{MAX_WEEKLY_COMMITMENTS})
            </button>
            {reconfirming && (
              <button type="button" onClick={() => setReconfirming(false)} className="text-xs font-bold text-gray-500 hover:underline">
                Cancel
              </button>
            )}
            {reconfirming && (
              <span className="text-xs text-amber-700">This replaces the commitment already confirmed for this week.</span>
            )}
          </div>
        </div>
      ) : (
        <ConfirmedWeek snapshot={currentSnapshot} onResolve={setResolution} onReconfirm={() => setReconfirming(true)} />
      )}
    </div>
  );
}

function ConfirmedWeek({
  snapshot,
  onResolve,
  onReconfirm,
}: {
  snapshot: WeeklyCommitmentSnapshot;
  onResolve: (snapshot: WeeklyCommitmentSnapshot, itemId: string, resolution: CommitmentResolution) => void;
  onReconfirm: () => void;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">
        Committed on {formatConfirmedAt(snapshot.confirmedAt)} for {formatSafeBusinessDate(snapshot.periodStart)} - {formatSafeBusinessDate(snapshot.periodEnd)}.
      </p>
      <ul className="mt-3 space-y-1.5 text-xs leading-5">
        {snapshot.items.map((item) => (
          <li key={item.id} className="rounded-lg bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-gray-900">{item.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${commitmentResolutionTone(item.resolution)}`}>
                {commitmentResolutionLabel(item.resolution)}
              </span>
            </div>
            {item.detail && <p className="mt-0.5 text-gray-600">{item.detail}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(['completed', 'carried-over', 'dropped'] as const).map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  onClick={() => onResolve(snapshot, item.id, item.resolution === resolution ? 'open' : resolution)}
                  className={`rounded-full px-2 py-0.5 font-bold ${item.resolution === resolution ? commitmentResolutionTone(resolution) : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  {commitmentResolutionLabel(resolution)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onReconfirm} className="mt-3 text-xs font-bold text-brand-blue hover:underline">
        Re-confirm this week
      </button>
    </div>
  );
}

function PlanVsActual({
  snapshot,
  activities,
  onResolve,
}: {
  snapshot: WeeklyCommitmentSnapshot;
  activities: SalesActivityRecord[];
  onResolve: (snapshot: WeeklyCommitmentSnapshot, itemId: string, resolution: CommitmentResolution) => void;
}) {
  useEffect(() => {
    trackProductEvent('weekly_commitment_reconciliation_viewed');
  }, []);

  const reconciliation = useMemo(
    () => reconcileWeeklyCommitment({ snapshot, activities }),
    [activities, snapshot],
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-emerald-700" />
        <h4 className="text-xs font-bold text-navy">Plan vs actual - week of {formatSafeBusinessDate(snapshot.periodStart)}</h4>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {reconciliation.committedCount} committed - {reconciliation.completedCount} completed,{' '}
        {reconciliation.carriedOverCount} carried over, {reconciliation.droppedCount} dropped,{' '}
        {reconciliation.openCount} never resolved.
        {reconciliation.suggestionsShown > 0 && ` You took ${reconciliation.suggestionsAccepted} of ${reconciliation.suggestionsShown} suggestions.`}
      </p>
      <ul className="mt-2 space-y-1.5 text-xs leading-5">
        {reconciliation.items.map((item) => (
          <li key={item.id} className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-gray-900">{item.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${commitmentResolutionTone(item.resolution)}`}>
                {commitmentResolutionLabel(item.resolution)}
              </span>
            </div>
            {item.evidence && <p className="mt-0.5 text-gray-600">{item.evidence.summary}</p>}
            {item.resolution === 'open' && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(['completed', 'carried-over', 'dropped'] as const).map((resolution) => (
                  <button
                    key={resolution}
                    type="button"
                    onClick={() => onResolve(snapshot, item.id, resolution)}
                    className="rounded-full bg-white px-2 py-0.5 font-bold text-gray-500 hover:bg-gray-100"
                  >
                    {commitmentResolutionLabel(resolution)}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {reconciliation.unplannedWork.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <p className="text-xs font-bold text-gray-500">Unplanned, and still worth something</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-gray-600">
            {reconciliation.unplannedWork.map((work) => (
              <li key={work.key}>
                <span className="font-bold text-gray-800">{work.accountName}</span> - {work.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatConfirmedAt(value: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return value;
  }
}

function nextWeekDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

function weekRangeFor(weekId: string) {
  const start = Date.parse(`${weekId}T00:00:00Z`);
  return {
    start: weekId,
    end: new Date(start + 6 * 86_400_000).toISOString().slice(0, 10),
  };
}
