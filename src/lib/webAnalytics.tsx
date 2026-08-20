import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';

/**
 * Anonymous traffic measurement, for the half of the funnel `product_events`
 * cannot see.
 *
 * `product_events` starts at the first thing somebody does *inside* the app. It
 * is deliberately blind to the landing page, to where a visitor came from, and
 * to everyone who read the pricing page and left - which is most of them, and
 * the part the operator most needs to watch before launch. Vercel measures that
 * from the edge, without a cookie and without an id that follows anyone
 * between sites, so it adds a picture without adding a privacy question the
 * legal page would have to answer.
 *
 * Behind a flag for one concrete reason. Web Analytics is a per-project switch
 * in the Vercel dashboard, and until it is on, `/_vercel/insights/script.js`
 * 404s - so mounting this unconditionally ships a failed request and a console
 * error to every visitor on every page load, on a deployment where nothing is
 * being collected anyway. The flag keeps the two halves of the change together:
 * turn the project switch on, set VITE_ENABLE_WEB_ANALYTICS=true, redeploy.
 *
 * The script is same-origin (`/_vercel/insights/*`), so it needs no CSP change:
 * `script-src 'self'` and `connect-src 'self'` in vercel.json already cover it.
 * Anything that made it cross-origin would need that CSP widened, which is the
 * review this note exists to trigger.
 */
export const isWebAnalyticsEnabled = import.meta.env.VITE_ENABLE_WEB_ANALYTICS === 'true';

/**
 * Send the path and nothing else.
 *
 * Two of this app's URLs carry secrets after the path, and both of them rely on
 * the fragment never reaching a server: the manager share link encodes an entire
 * pipeline brief - account names, deal values - as `/share/brief#b=...`, and
 * Supabase hands back `#access_token=...` on the recovery and verification
 * routes. A pageview beacon is a request this page makes itself, so that
 * guarantee stops holding the moment analytics is on - whatever `event.url`
 * holds is what gets stored. Query strings are the same story.
 *
 * Only the path is worth measuring anyway: which pages get read, and where
 * people leave. Nothing downstream reads a query string or a fragment.
 *
 * Not exported: this file also exports a component, and a second non-component
 * export breaks Fast Refresh (react-refresh/only-export-components).
 */
function toPathOnlyEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    // A URL this cannot parse is a URL whose shape is unknown, which is exactly
    // the case where forwarding it verbatim is the risk. Drop the pageview.
    return null;
  }
}

export function WebAnalytics() {
  if (!isWebAnalyticsEnabled) return null;
  return <Analytics beforeSend={toPathOnlyEvent} />;
}
