import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getBearerToken, verifyUserToken } from './_auth.js';
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { enforceRateLimit } from './_rateLimit.js';
import { buildDailyDigest } from './_digest.js';
import { AUTOMATION_DEFAULTS, parseAutomationSettings, automationBusinessClock } from '../shared/automation.js';
import { prepareAutomationWork } from '../src/domain/automation/automationEngine.ts';

const digest = value => createHash('sha256').update(value).digest();
const configured = env => env.AUTOMATION_ENABLED === 'true' && !!env.CRON_SECRET && !!env.SUPABASE_SERVICE_ROLE_KEY;
function prepare(snapshot, settings, date) {
  // Include deleted Plan tombstones: a user's deletion is a durable refusal,
  // and must not consume the limit again every day or resurrect the reminder.
  const ids = new Set(snapshot.plans.map(row => row.id));
  const work = prepareAutomationWork(snapshot, settings, date,
    key => ids.has('auto-' + createHash('sha256').update(key).digest('hex')));
  const brief = settings.dailyBrief ? buildDailyDigest(work.digestInput, date) : null;
  return { work, summary: { counts: work.counts, commitments: work.commitmentCounts,
    plannedWork: work.candidates.map(({key,label,rule,sourceId}) => ({key,label,rule,sourceId})),
    brief: brief ? { counts: brief.counts, lines: brief.lines.slice(0, 24), hasSignal: brief.hasSignal } : null,
    basis: 'confirmed-cloud-records', inboxMonitoring: false,
  } };
}

/** The same worker serves a scheduler and an explicit, authenticated Run now. */
export async function executeAutomationRun(client, settingsRow, manual = false) {
  const claimed = await client.rpc('memoire_claim_automation_run', {
    p_owner: settingsRow.user_id, p_revision: settingsRow.revision, p_manual: manual,
  });
  if (claimed.error) throw new Error('claim_unavailable');
  const job = claimed.data;
  if (!job) return { status: 'skipped' };
  if (job.user_id !== settingsRow.user_id) throw new Error('invalid_run_scope');
  try {
    const read = await client.rpc('memoire_read_automation_run', { p_run: job.id, p_lease: job.lease_token });
    if (read.error || !read.data) throw new Error('snapshot_unavailable');
    const settings = parseAutomationSettings(read.data.config);
    const { work, summary } = prepare(read.data.snapshot, settings, read.data.businessDate);
    const finish = await client.rpc('memoire_finish_automation_run', { p_run: job.id, p_lease: job.lease_token,
      p_fingerprint: read.data.fingerprint, p_candidates: work.candidates, p_retire_ids: work.retireIds, p_summary: summary });
    if (finish.error || !finish.data) throw new Error('result_unconfirmed');
    return { status: finish.data.cancelled ? 'cancelled' : finish.data.retryable ? 'retryable' : 'completed', summary: finish.data };
  } catch {
    // A timeout after commit cannot downgrade a completed receipt. Retry reads
    // the durable run; deterministic Plan IDs also preserve deleted tombstones.
    await client.rpc('memoire_fail_automation_run', { p_run: job.id, p_lease: job.lease_token });
    throw new Error('run_unconfirmed');
  }
}

export function createAutomationHandler({
  env = process.env, verify = verifyUserToken, rateLimit = enforceRateLimit,
  clientForToken = token => createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  }),
  adminClient = () => createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false } }),
  clock = () => new Date(),
} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, body) => res.status(status).json({ version: 1, ...body });
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST'); return reply(405, { error: 'method_not_allowed' });
    }
    const quota = rateLimit(req, 'automation-address', '', 60);
    if (!quota.allowed) { res.setHeader('Retry-After', String(quota.retryAfterSeconds)); return reply(429, { error: 'rate_limited' }); }
    try {
      const token = getBearerToken(req.headers), user = await verify(token, undefined, { requireUserId: false });
      if (!user) return reply(401, { error: 'unauthorized' });
      const ownerQuota = rateLimit(req, 'automation-owner', user.id, 30);
      if (!ownerQuota.allowed) return reply(429, { error: 'rate_limited' });
      if (Object.keys(req.query || {}).some(key => key !== 'resource')) return reply(400, { error: 'invalid_query' });
      const client = clientForToken(token);
      const load = await client.from('memoire_automation_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (load.error) return reply(503, { error: 'automation_storage_unavailable' });
      if (load.data && load.data.user_id !== user.id) return reply(503, { error: 'invalid_stored_scope' });
      if (req.method === 'GET') {
        const runs = await client.from('memoire_automation_runs')
          .select('id,business_date,settings_revision,status,attempts,started_at,finished_at,summary,error_code')
          .eq('user_id', user.id).order('started_at', { ascending: false }).limit(20);
        if (runs.error || !Array.isArray(runs.data)) return reply(503, { error: 'automation_history_unavailable' });
        return reply(200, { config: load.data?.config || AUTOMATION_DEFAULTS, revision: load.data?.revision || 0,
          workerConfigured: configured(env), schedulerVerified: false, runs: runs.data });
      }
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 4000) return reply(400, { error: 'invalid_command' });
      if (body.command === 'preview' && Object.keys(body).sort().join(',') === 'command,config') {
        let settings; try { settings = parseAutomationSettings(body.config); } catch { return reply(400, { error: 'invalid_settings' }); }
        const snapshot = await client.rpc('memoire_preview_automation');
        if (snapshot.error || !snapshot.data) return reply(503, { error: 'snapshot_unavailable' });
        const { work, summary } = prepare(snapshot.data, settings, automationBusinessClock(settings, clock()).date);
        return reply(200, { preview: true, candidates: work.candidates, retiring: work.retireIds.length, summary });
      }
      if (body.command === 'save' && Object.keys(body).sort().join(',') === 'command,config,revision') {
        let config; try { config = parseAutomationSettings(body.config); } catch { return reply(400, { error: 'invalid_settings' }); }
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) return reply(400, { error: 'invalid_revision' });
        if (config.enabled && !configured(env)) return reply(503, { error: 'worker_not_configured' });
        const saved = await client.rpc('memoire_save_automation_settings', { p_config: config, p_revision: body.revision });
        if (saved.error || !saved.data) return reply(409, { error: 'settings_not_saved_reload' });
        return reply(200, { config: saved.data.config, revision: saved.data.revision });
      }
      if (body.command === 'run' && Object.keys(body).length === 1) {
        if (!configured(env) || !load.data?.config?.enabled) return reply(409, { error: 'automation_not_enabled' });
        const outcome = await executeAutomationRun(adminClient(), load.data, true);
        return reply(outcome.status === 'retryable' ? 409 : 200, outcome);
      }
      return reply(400, { error: 'invalid_command' });
    } catch { return reply(503, { error: 'automation_unavailable' }); }
  };
}

/** Scheduler endpoint never accepts an owner or commands from the request. */
export function createAutomationWorker({ env = process.env,
  clientFactory = () => createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false } }),
} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
    const authorization = req.headers?.authorization;
    if (!env.CRON_SECRET || typeof authorization !== 'string'
      || !timingSafeEqual(digest(authorization), digest(`Bearer ${env.CRON_SECRET}`))) return res.status(401).json({ error: 'unauthorized' });
    if (!configured(env)) return res.status(503).json({ error: 'automation_not_configured' });
    const results = { considered: 0, completed: 0, skipped: 0, failed: 0 };
    try {
      const client = clientFactory(); let after = '', done = false;
      const deadline = Date.now() + 45000;
      // Keyset pagination, bounded pages and an explicit incomplete result.
      // The worker has no customer-message or commercial command executor.
      for (let page = 0; page < 20; page++) {
        let query = client.from('memoire_automation_settings').select('*').eq('config->>enabled', 'true')
          .order('user_id', { ascending: true }).limit(25);
        if (after) query = query.gt('user_id', after);
        const response = await query;
        if (response.error || !Array.isArray(response.data)) throw new Error('settings_unavailable');
        for (const settings of response.data) {
          if (Date.now() >= deadline) return res.status(503).json({ ...results, complete: false, error: 'time_budget_exhausted' });
          results.considered++;
          try {
            const outcome = await executeAutomationRun(client, settings);
            if (outcome.status === 'completed') results.completed++;
            else if (outcome.status === 'skipped' || outcome.status === 'cancelled') results.skipped++;
            else results.failed++;
          } catch { results.failed++; }
        }
        if (response.data.length < 25) { done = true; break; }
        after = response.data.at(-1).user_id;
      }
      return res.status(done && !results.failed ? 200 : 503).json({ ...results, complete: done });
    } catch { return res.status(503).json({ ...results, complete: false, error: 'worker_unavailable' }); }
  };
}
