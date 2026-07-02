import { applyRateLimitHeaders, enforceRateLimit } from './_rateLimit.js';

type ClientLogRequest = {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

type ClientLogResponse = {
  status: (code: number) => ClientLogResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
};

const ALLOWED_EVENTS = new Set(['cloud_json_sync_failed', 'pipeline_defense_cloud_sync_failed', 'client_render_error']);
const DATA_MODES = new Set(['demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown']);
const SEVERITIES = new Set(['warning', 'error']);

export default function handler(req: ClientLogRequest, res: ClientLogResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const payload = buildClientLogPayload(req.body || {});
  if (!payload) {
    return res.status(400).json({ error: 'Invalid operational event.' });
  }

  const rateLimit = enforceRateLimit(req, 'client-log', `${payload.eventName}:${payload.component}:${payload.operation}`, 30, 60_000);
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    return res.status(202).json({ success: true });
  }

  console.error(JSON.stringify({
    level: payload.severity,
    message: 'Memoire client operational event',
    ...payload,
    timestamp: new Date().toISOString(),
  }));

  return res.status(202).json({ success: true });
}

export function buildClientLogPayload(body: Record<string, unknown>) {
  const eventName = cleanText(body.eventName, 80);
  if (!ALLOWED_EVENTS.has(eventName)) return null;

  const dataMode = cleanText(body.dataMode, 40);
  if (!DATA_MODES.has(dataMode)) return null;

  const component = cleanText(body.component, 80);
  const operation = cleanText(body.operation, 80);
  if (!component || !operation) return null;

  const severity = cleanText(body.severity, 20);

  return {
    eventName,
    route: cleanRoute(body.route),
    dataMode,
    component,
    operation,
    table: cleanText(body.table, 80),
    severity: SEVERITIES.has(severity) ? severity : 'warning',
    error: cleanText(body.error, 240),
  };
}

function cleanRoute(value: unknown) {
  const route = cleanText(value, 160);
  return route.startsWith('/') && !route.includes('?') && !route.includes('#') ? route : '';
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
