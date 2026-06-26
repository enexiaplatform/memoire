import { enforceRateLimit, applyRateLimitHeaders, rateLimitExceeded } from './_rateLimit.js';

const ALLOWED_EVENTS = ['cloud_json_sync_failed', 'pipeline_defense_cloud_sync_failed'] as const;
const ALLOWED_DATA_MODES = ['demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown'] as const;

type AllowedEvent = (typeof ALLOWED_EVENTS)[number];
type AllowedDataMode = (typeof ALLOWED_DATA_MODES)[number];

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLen);
}

function cleanRoute(value: unknown): string {
  if (typeof value !== 'string') return '';
  const route = cleanText(value, 160);
  if (!route.includes('?') && !route.includes('#')) return route;
  return route.replace(/[?#].*/, '');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const rateResult = enforceRateLimit(req, 'client-log', undefined, 20, 60_000);
  applyRateLimitHeaders(res, rateResult);
  if (!rateResult.allowed) {
    return rateLimitExceeded(res, rateResult);
  }

  const body = req.body || {};

  const eventName = ALLOWED_EVENTS.includes(body.eventName as AllowedEvent) ? (body.eventName as AllowedEvent) : null;
  if (!eventName) {
    return res.status(400).json({ error: 'Unknown event.' });
  }

  const route = cleanRoute(body.route);

  const dataMode = ALLOWED_DATA_MODES.includes(body.dataMode as AllowedDataMode) ? (body.dataMode as AllowedDataMode) : 'unknown';

  const entry = {
    message: 'Memoire client operational event',
    eventName,
    route,
    dataMode,
    component: cleanText(body.component, 80),
    operation: cleanText(body.operation, 80),
    table: cleanText(body.table, 80),
    severity: body.severity === 'error' ? 'error' : 'warning',
    error: cleanText(body.error, 240),
    timestamp: new Date().toISOString(),
  };

  console.error(JSON.stringify(entry));

  return res.status(202).json({ success: true });
}
