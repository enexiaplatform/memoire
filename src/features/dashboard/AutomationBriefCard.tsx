import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { automationClient, AUTOMATION_UPDATED_EVENT, type AutomationRun } from '../../services/automationClient.ts';

export function AutomationBriefCard({ userId, sampleDataActive }: {userId?: string; sampleDataActive: boolean}) {
  const [result, setResult] = useState<{owner: string; run: AutomationRun} | null>(null);
  useEffect(() => {
    let active = true, request = 0;
    setResult(null);
    if (!userId || sampleDataActive) return;
    const refresh = async () => {
      const sequence = ++request;
      try {
        const state = await automationClient.load(userId);
        if (!active || sequence !== request) return;
        const run = state.config.enabled && state.config.dailyBrief
          ? state.runs.find(item => item.status === 'completed' && item.summary.brief) : undefined;
        setResult(run ? { owner: userId, run } : null);
      } catch { if (active && sequence === request) setResult(null); }
    };
    void refresh(); window.addEventListener(AUTOMATION_UPDATED_EVENT, refresh);
    return () => { active = false; window.removeEventListener(AUTOMATION_UPDATED_EVENT, refresh); };
  }, [sampleDataActive, userId]);
  if (!result || result.owner !== userId || sampleDataActive) return null;
  const { run } = result;
  return <details className="rounded-xl border border-line bg-white px-4 py-3">
    <summary className="cursor-pointer text-sm font-semibold text-ink">Prepared in the background · {run.business_date}</summary>
    <p className="mt-2 text-xs text-muted">Saved cloud snapshot, not the current live picture. Browser-only changes and email replies are not included.</p>
    {run.summary.brief?.hasSignal ? <ul className="mt-2 space-y-1 text-sm text-muted">{run.summary.brief.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      : <p className="mt-2 text-sm text-muted">No signal was found in the cloud records used by this run.</p>}
    <p className="mt-2 text-sm text-muted">{run.summary.createdPlanIds?.length || 0} Plan item(s) created. <Link className="text-brand-blue underline" to="/app/settings?tab=automations">Rules and run history</Link></p>
  </details>;
}
