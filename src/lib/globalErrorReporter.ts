import { reportClientOperationalEvent } from '../services/clientTelemetry';

const MAX_REPORTS_PER_SESSION = 5;

// Noise that says nothing about Memoire's own code: browser quirks,
// extension scripts, and network flakiness already surfaced elsewhere.
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|ERR_CONNECTION/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /AbortError/i,
];

let installed = false;
let reportedCount = 0;
const reportedSignatures = new Set<string>();

/**
 * Production error visibility (P0 monitoring gate, code side): uncaught
 * errors and unhandled rejections flow to /api/client-log through the
 * existing operational-event pipe (rate-limited server-side, inert unless
 * VITE_CLIENT_LOG_ENDPOINT is configured). Deduplicated per signature and
 * capped per session so a render loop cannot flood the endpoint.
 */
export function installGlobalErrorReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    report('window_error', event.error instanceof Error ? event.error : event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    report('unhandled_rejection', event.reason instanceof Error ? event.reason : String(event.reason ?? 'Unknown rejection'));
  });
}

function report(operation: 'window_error' | 'unhandled_rejection', error: Error | string) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message || IGNORED_PATTERNS.some((pattern) => pattern.test(message))) return;
  if (reportedCount >= MAX_REPORTS_PER_SESSION) return;

  const signature = `${operation}:${message.slice(0, 160)}`;
  if (reportedSignatures.has(signature)) return;
  reportedSignatures.add(signature);
  reportedCount += 1;

  reportClientOperationalEvent({
    eventName: 'client_render_error',
    component: 'global',
    operation,
    severity: 'error',
    error,
  });
}
