import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.ts';
import { hasLocalSampleData } from '../../utils/dataMode.ts';
import { useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus.ts';
import { AUTOMATION_DEFAULTS, type AutomationSettings } from '../../../shared/automation.js';
import { automationClient, AUTOMATION_UPDATED_EVENT, type AutomationPreview, type AutomationRun, type AutomationState, type AutomationTransport } from '../../services/automationClient.ts';

const fieldClass = 'min-w-0 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
const buttonClass = 'rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50';
const timezones = ['Asia/Ho_Chi_Minh', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Kolkata', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

export function AutomationPanel() {
  const { user } = useAuth();
  const sync = useWorkspaceSyncStatus();
  const disabledReason = hasLocalSampleData() ? 'Automations do not run in the demo workspace.'
    : !user ? 'Sign in to a cloud workspace to configure automations.' : '';
  return <AutomationControls key={user?.id || 'guest'} ownerId={user?.id || ''} disabledReason={disabledReason}
    syncWarning={sync.state === 'error' ? 'Some browser changes have not reached the cloud. Background work only uses confirmed cloud records.' : ''} />;
}

/** Also used by the isolated browser fixture with an injected real test API. */
export function AutomationControls({ ownerId, disabledReason = '', syncWarning = '', client = automationClient }: {
  ownerId: string; disabledReason?: string; syncWarning?: string; client?: AutomationTransport;
}) {
  const [state, setState] = useState<AutomationState | null>(null);
  const [config, setConfig] = useState<AutomationSettings>({ ...AUTOMATION_DEFAULTS });
  const [busy, setBusy] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [preview, setPreview] = useState<AutomationPreview | null>(null);
  const [reload, setReload] = useState(0);
  const generation = useRef({ valid: true }), operation = useRef(false);
  useEffect(() => {
    const current = { valid: true }; generation.current = current;
    operation.current = false; setState(null); setPreview(null); setError(''); setMessage(''); setBusy('loading');
    setConfig({ ...AUTOMATION_DEFAULTS });
    if (disabledReason || !ownerId) { setBusy(''); return; }
    void client.load(ownerId).then(result => {
      if (!current.valid) return;
      setState(result); setConfig(result.config);
    }).catch(reason => { if (current.valid) setError(reason instanceof Error ? reason.message : 'Could not load rules.'); })
      .finally(() => { if (current.valid) setBusy(''); });
    return () => { current.valid = false; };
  }, [client, disabledReason, ownerId, reload]);
  const dirty = !!state && JSON.stringify(config) !== JSON.stringify(state.config);
  const change = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
    setConfig(previous => ({ ...previous, [key]: value })); setPreview(null); setMessage('');
  };
  const act = async (kind: 'save' | 'preview' | 'run') => {
    if (operation.current || !state || disabledReason) return;
    operation.current = true; const current = generation.current;
    setBusy(kind); setError(''); setMessage('');
    try {
      if (kind === 'save') {
        const saved = await client.save(ownerId, config, state.revision);
        if (!current.valid) return;
        setConfig(saved.config); setState(previous => previous ? { ...previous, ...saved } : null); setPreview(null);
        setMessage(saved.config.enabled ? 'Rules saved to your account. Scheduled execution depends on a configured scheduler; check run history.' : 'Rules saved. Background work is paused.');
      } else if (kind === 'preview') {
        const result = await client.preview(ownerId, config);
        if (!current.valid) return;
        setPreview(result); setMessage('Preview only. No Plan items or business records were changed.');
      } else {
        const result = await client.run(ownerId);
        if (!current.valid) return;
        setMessage(result.status === 'completed' ? `Run completed. ${result.summary?.createdPlanIds?.length || 0} Plan item(s) created.`
          : result.status === 'skipped' ? 'No new run was started. Check today’s history and saved rules before trying again.'
            : 'The source or rules changed. Check history before running again.');
        const latest = await client.load(ownerId);
        if (!current.valid) return;
        setState(latest); setConfig(latest.config);
      }
      window.dispatchEvent(new Event(AUTOMATION_UPDATED_EVENT));
    } catch (reason) { if (current.valid) setError(reason instanceof Error ? reason.message : 'Could not confirm this operation.'); }
    finally { if (current.valid) { operation.current = false; setBusy(''); } }
  };
  return <section aria-label="Automations" className="min-w-0 rounded-panel bg-white p-5 shadow-panel">
    <h2 className="font-display text-xl font-bold text-ink">Automations</h2>
    <p className="mt-1 text-sm text-muted">Prepare Today and create internal reminders from your cloud records, even while Memoire is closed.</p>
    <p className="mt-2 text-xs text-muted">These rules use recorded quote and commitment states. Email replies are not monitored. No customer messages or financial changes are made.</p>
    {disabledReason && <p role="status" className="mt-4 text-sm text-muted">{disabledReason}</p>}
    {syncWarning && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{syncWarning}</p>}
    {busy === 'loading' && !disabledReason && <p role="status" className="mt-4 text-sm">Loading rules and run history…</p>}
    {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}
      <button className="ml-3 underline" disabled={!!busy} onClick={() => setReload(value => value + 1)}>Reload rules</button></div>}
    {state && <>
      <p className="mt-4 rounded-lg bg-page p-3 text-sm text-muted">{state.workerConfigured
        ? 'Background execution is available. Check run history to confirm when work actually runs.'
        : 'Background execution is not configured on this deployment. Preview is available; enabling is blocked.'}</p>
      <fieldset disabled={!!busy} className="mt-5 space-y-4">
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.enabled}
          disabled={!!busy || !state.workerConfigured && !config.enabled} onChange={event => change('enabled', event.target.checked)} />Enable background rules</label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Timezone<select className={`mt-1 ${fieldClass}`} value={config.timezone} onChange={event => change('timezone', event.target.value)}>
            {[...new Set([config.timezone, ...timezones])].map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
          </select></label>
          <label className="min-w-0 text-sm">Daily start hour<select className={`mt-1 ${fieldClass}`} value={config.runHour} onChange={event => change('runHour', Number(event.target.value))}>
            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
          </select></label>
        </div>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={config.dailyBrief} onChange={event => change('dailyBrief', event.target.checked)} /><span><strong className="block">Prepare Today brief</strong><span className="text-muted">A saved summary of overdue actions, quiet deals and recorded commercial dates. Available on Today; email preferences stay in Workspace.</span></span></label>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={config.quoteFollowup} onChange={event => change('quoteFollowup', event.target.checked)} /><span><strong className="block">Quote follow-up</strong><span className="text-muted">Create a Plan reminder for Sent/Revised quotes. Accepted, rejected, ordered and closed opportunities stop new reminders.</span></span></label>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">Days after quote date<input className="w-20 rounded-lg border border-line px-2 py-1" type="number" min="1" max="30" value={config.quoteDays} onChange={event => change('quoteDays', Number(event.target.value))} /></label>
        </div>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={config.commitmentReminder} onChange={event => change('commitmentReminder', event.target.checked)} /><span><strong className="block">Commitment reminders</strong><span className="text-muted">Create an internal check-in for open promises from you, your customer or your team.</span></span></label>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">Days before due date<input className="w-20 rounded-lg border border-line px-2 py-1" type="number" min="0" max="7" value={config.commitmentLeadDays} onChange={event => change('commitmentLeadDays', Number(event.target.value))} /></label>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm">Maximum new Plan items per run<input className="w-20 rounded-lg border border-line px-2 py-1" type="number" min="1" max="10" value={config.maxPlanItems} onChange={event => change('maxPlanItems', Number(event.target.value))} /></label>
        <p className="text-xs text-muted">One completed run per local day. Existing dated deal actions and handled reminders are kept. Untouched automatic reminders can be retired when their source ends or moves; your manual edits are preserved.</p>
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className={buttonClass} disabled={!!busy} onClick={() => void act('preview')}>{busy === 'preview' ? 'Preparing…' : 'Preview rules'}</button>
        <button className={`${buttonClass} bg-ink text-white`} disabled={!!busy || !dirty} onClick={() => void act('save')}>{busy === 'save' ? 'Saving…' : 'Save rules'}</button>
        <button className={buttonClass} disabled={!!busy || dirty || !state.config.enabled || !state.workerConfigured} onClick={() => void act('run')}>{busy === 'run' ? 'Running…' : 'Run now'}</button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-muted">{message}</p>}
      {preview && <div className="mt-4 rounded-lg border border-line p-4"><h3 className="font-semibold text-ink">Preview · no changes saved</h3>
        <p className="mt-1 text-sm text-muted">{preview.candidates.length} new reminder(s), {preview.summary.counts?.alreadyHandled || 0} already planned/handled, {preview.summary.counts?.deferred || 0} deferred by your limit; {preview.retiring} untouched reminder(s) can be retired.</p>
        <ul className="mt-3 space-y-3">{preview.candidates.map(item => <li key={item.key} className="break-words text-sm"><strong>{item.label}</strong><p className="text-xs text-muted">{item.accountName} · {item.reason}</p></li>)}</ul>
      </div>}
      <div className="mt-6 border-t border-line pt-4"><h3 className="font-semibold text-ink">Run history</h3>
        {!state.runs.length && <p className="mt-2 text-sm text-muted">No run has been confirmed. Saving rules does not prove that a scheduler is active.</p>}
        <ul className="mt-2 space-y-3">{state.runs.map(run => <AutomationRunRow key={run.id} run={run} />)}</ul>
      </div>
    </>}
  </section>;
}

export function AutomationRunRow({ run }: {run: AutomationRun}) {
  return <li className="rounded-lg border border-line p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><strong>{run.business_date} · {run.status}</strong><span className="text-xs text-muted">Attempt {run.attempts} / 3</span></div>
    {run.status === 'completed' && <p className="mt-1 text-muted">{run.summary.createdPlanIds?.length || 0} created · {run.summary.retiredPlanIds?.length || 0} retired · {run.summary.counts?.deferred || 0} deferred.
      <Link className="ml-2 text-brand-blue underline" to={`/app/timeline?date=${encodeURIComponent(run.business_date)}`}>Open Plan</Link></p>}
    {run.status === 'running' && <p className="mt-1 text-muted">Processing. An expired run can be recovered by the next scheduled attempt.</p>}
    {run.error_code && <p className="mt-1 text-muted">{run.error_code === 'source_changed' ? 'Records changed before execution. No work was applied; a later attempt can retry.'
      : run.status === 'cancelled' ? 'Rules or business date changed before execution. No work was applied.' : 'The result was not confirmed. Check Plan and retry history before continuing.'}</p>}
  </li>;
}
