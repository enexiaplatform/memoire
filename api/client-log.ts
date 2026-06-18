import { enforceRateLimit } from './_rateLimit.js';

interface ClientLogBody {
  eventName?: unknown;
  route?: unknown;
  dataMode?: unknown;
  component?: unknown;
  operation?: unknown;
  table?: unknown;
  severity?: unknown;
  error?: unknown;
}

interface ApiRequest {
  method?: string;
  body?: ClientLogBody;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
}

const EVENTS = new Set([
  'cloud_json_sync_failed',
  'pipeline_defense_cloud_sync_failed',
]);
const DATA_MODES = new Set(['demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown']);
const SEVERITIES = new Set(['warning', 'error']);

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const body = req.body || {};
  const eventName = cleanText(body.eventName, 80);
  const dataMode = cleanText(body.dataMode, 40) || 'unknown';

  if (!EVENTS.has(eventName) || !DATA_MODES.has(dataMode)) {
    return res.status(400).json({ error: 'Invalid client log event.' });
  }

  const rateLimit = enforceRateLimit(req, 'client-log', eventName, 120, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return res.status(202).json({ success: true });
  }

  const severity = cleanText(body.severity, 20);
  const entry = {
    level: SEVERITIES.has(severity) ? severity : 'warning',
    message: 'Memoire client operational event',
    eventName,
    route: cleanRoute(body.route),
    dataMode,
    component: cleanText(body.component, 80),
    operation: cleanText(body.operation, 80),
    table: cleanText(body.table, 80),
    error: cleanText(body.error, 240),
    timestamp: new Date().toISOString(),
  };

  console.error(JSON.stringify(entry));
  return res.status(202).json({ success: true });
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanRoute(value: unknown) {
  const route = cleanText(value, 160);
  return route.startsWith('/') && !route.includes('?') && !route.includes('#') ? route : '';
}
