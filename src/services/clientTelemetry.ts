type ClientOperationalEvent = {
  eventName:
    | 'cloud_json_sync_failed'
    | 'pipeline_defense_cloud_sync_failed'
    | 'client_render_error'
    // A write this browser refused: the record did not land locally either.
    | 'local_write_failed';
  component: string;
  operation: string;
  table?: string;
  severity?: 'warning' | 'error';
  error?: unknown;
};

/**
 * Reports and never throws.
 *
 * Every caller is inside a `catch`. A reporter that can throw from there
 * replaces a precise failure with a vague one - which is exactly what happened
 * when the local-write guard called this outside Vite and lost a
 * QuotaExceededError to a TypeError about `import.meta.env`.
 */
export function reportClientOperationalEvent(event: ClientOperationalEvent) {
  try {
    send(event);
  } catch {
    // Telemetry is never worth breaking the path that was already failing.
  }
}

function send(event: ClientOperationalEvent) {
  if (typeof window === 'undefined') return;

  const endpoint = import.meta.env?.VITE_CLIENT_LOG_ENDPOINT;
  if (!endpoint) return;

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

  void fetch(endpoint, {
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
