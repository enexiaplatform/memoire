import { supabaseClient } from '../lib/supabaseClient.ts';
import { captureLocalWorkspaceScope } from './localWorkspaceOwner.ts';
import type { AutomationSettings } from '../../shared/automation.js';
import type { AutomationCandidate } from '../domain/automation/automationEngine.ts';

export type AutomationSummary = {
  counts?: { eligible: number; alreadyHandled: number; deferred: number };
  commitments?: { due: number }; createdPlanIds?: string[]; retiredPlanIds?: string[];
  businessDate?: string; asOf?: string;
  brief?: { lines: string[]; hasSignal: boolean } | null;
};
export type AutomationRun = {
  id: string; business_date: string; status: 'running' | 'completed' | 'failed' | 'cancelled';
  attempts: number; started_at: string; finished_at?: string; summary: AutomationSummary; error_code?: string;
};
export type AutomationState = {
  config: AutomationSettings; revision: number; workerConfigured: boolean;
  schedulerVerified: boolean; runs: AutomationRun[];
};
export type AutomationPreview = { candidates: AutomationCandidate[]; retiring: number; summary: AutomationSummary };
export type AutomationTransport = {
  load(owner: string): Promise<AutomationState>;
  save(owner: string, config: AutomationSettings, revision: number): Promise<{config: AutomationSettings; revision: number}>;
  preview(owner: string, config: AutomationSettings): Promise<AutomationPreview>;
  run(owner: string): Promise<{status: string; summary?: AutomationSummary}>;
};
const errors: Record<string, string> = {
  automation_storage_unavailable: 'Automation storage is not ready on this deployment. Your rules have not been changed.',
  automation_history_unavailable: 'Run history could not be read. Try again before changing rules.',
  settings_not_saved_reload: 'These rules changed elsewhere or could not be saved. Reload before trying again.',
  worker_not_configured: 'Background execution is not configured on this deployment. Rules were not enabled.',
  automation_not_enabled: 'Save and enable these rules before running them.',
  invalid_settings: 'Check the timezone, hour and reminder limits.',
  snapshot_unavailable: 'Cloud records could not be read completely. No preview or work was saved.',
};
async function request(owner: string, body?: object) {
  const sameScope = captureLocalWorkspaceScope();
  if (!supabaseClient) throw new Error('Sign in to a cloud workspace to use automations.');
  const { data, error } = await supabaseClient.auth.getSession();
  if (!sameScope() || error || !data.session || data.session.user.id !== owner) throw new Error('Your account changed. Reload before continuing.');
  const response = await fetch('/api/commercial?resource=automations', {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  if (!sameScope()) throw new Error('Your account changed. Reload before continuing.');
  if (!response.ok || !result || result.version !== 1) throw new Error(errors[result?.error] || 'Automation result could not be confirmed. Reload history before retrying.');
  return result;
}
export const automationClient: AutomationTransport = {
  load: owner => request(owner),
  save: (owner, config, revision) => request(owner, { command: 'save', config, revision }),
  preview: (owner, config) => request(owner, { command: 'preview', config }),
  run: owner => request(owner, { command: 'run' }),
};
export const AUTOMATION_UPDATED_EVENT = 'memoire:automations-updated';
