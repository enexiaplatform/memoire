type ClientOperationalEvent = {
  eventName: 'cloud_json_sync_failed' | 'pipeline_defense_cloud_sync_failed' | 'client_render_error';
  component: string;
  operation: string;
  table?: string;
  severity?: 'warning' | 'error';
  error?: unknown;
};

export function reportClientOperationalEvent(event: ClientOperationalEvent) {
  if (typeof window === 'undefined') return;

  if (!import.meta.env.VITE_CLIENT_LOG_ENDPOINT) return;

  const body = JSON.stringify({
    eventName: event.eventName,
    route: window.location.pathname,
    dataMode: getDataMode(),
    component: event.component,
    operation: event.operation,
    table: event.table,
    severity: event.severity || 'warning',
    error: event.error instanceof Error ? event.error.message : String(event.error || ''),
  });

  void fetch(import.meta.env.VITE_CLIENT_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: body.length < 8_000,
  }).catch(() => undefined);
}

function getDataMode() {
  if (
    window.localStorage.getItem('memoire_demo_workspace') === 'interactive-demo' ||
    window.localStorage.getItem('memoire.sampleData.loaded') === 'true'
  ) {
    return 'demo-local';
  }
  return 'unknown';
}
