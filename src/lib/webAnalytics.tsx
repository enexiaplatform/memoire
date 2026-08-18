import { Analytics } from '@vercel/analytics/react';

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

export function WebAnalytics() {
  if (!isWebAnalyticsEnabled) return null;
  return <Analytics />;
}
