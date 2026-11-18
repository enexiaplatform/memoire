import { createClient } from '@supabase/supabase-js';
import { getBearerToken, verifyUserToken } from './_auth.js';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from './_env.js';
import { enforceRateLimit } from './_rateLimit.js';
import { DATA_WORKSPACE_HEADER } from './_workspaceScope.js';

const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const nullableText = (value, max) => value === null || text(value, max);
const fields = 'activityId,derivedKey,expectedUpdatedAt,label,planId,requestId,tag';

function sessionId(token) {
  try {
    const { session_id: session } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return isUuid(session) ? session : null;
  } catch {
    return null;
  }
}

export function createPlanCompletionHandler({
  verify = verifyUserToken, rateLimit = enforceRateLimit, env = process.env,
  database = () => createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false } }),
} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status, body) => res.status(status).json(body);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(405, { status: 'method_not_allowed' });
    }
    if (env.PLAN_COMPLETION_ENABLED !== 'true') return reply(503, { status: 'paused' });
    const workspace = req.headers?.[DATA_WORKSPACE_HEADER];
    if ((workspace !== 'default' && !isUuid(workspace)) || req.headers?.['x-memoire-workspace'] !== undefined) {
      return reply(400, { status: 'invalid_scope' });
    }
    const body = req.body;
    if (!body || Object.keys(body).sort().join(',') !== fields
      || !isUuid(body.requestId) || !isUuid(body.activityId)
      || !body.planId || !text(body.planId, 200) || !nullableText(body.derivedKey, 185)
      || !nullableText(body.expectedUpdatedAt, 80) || !nullableText(body.label, 500) || !nullableText(body.tag, 240)) {
      return reply(400, { status: 'invalid' });
    }
    if (!rateLimit(req, 'plan-completion-address', '', 120).allowed) return reply(429, { status: 'rate_limited' });

    try {
      const token = getBearerToken(req.headers);
      const session = sessionId(token);
      const user = session && await verify(token, undefined, { requireUserId: false });
      if (!user) return reply(401, { status: 'unauthorized' });
      if (!rateLimit(req, 'plan-completion-owner', user.id, 60).allowed) return reply(429, { status: 'rate_limited' });
      const { data, error } = await database().rpc('memoire_confirm_plan_completion', {
        p_actor: user.id, p_session: session, p_workspace: workspace === 'default' ? null : workspace,
        p_request: body.requestId, p_activity: body.activityId, p_plan_id: body.planId,
        p_derived_key: body.derivedKey, p_expected: body.expectedUpdatedAt, p_label: body.label, p_tag: body.tag,
      });
      if (!error && data?.status === 'confirmed') return reply(200, data);
      if (!error && ['unauthorized', 'unavailable', 'conflict', 'activity_unavailable', 'invalid'].includes(data?.status)) {
        const status = { unauthorized: 401, unavailable: 404, conflict: 409, activity_unavailable: 409, invalid: 400 }[data.status];
        return reply(status, { status: data.status });
      }
      console.error(JSON.stringify({ event: 'plan_completion_unconfirmed', requestId: body.requestId, code: error?.code || 'invalid_result' }));
      return reply(503, { status: 'unconfirmed' });
    } catch {
      return reply(503, { status: 'unconfirmed' });
    }
  };
}
