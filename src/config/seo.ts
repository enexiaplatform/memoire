/**
 * One place that knows the site's public identity.
 *
 * Before this file the production URL was typed literally in `index.html` (five
 * times, in the link-preview block) and nowhere else - no page declared a
 * canonical URL, and every public page shipped `noindex, nofollow` in three
 * places at once: the static head, its own `<Helmet>`, and an `X-Robots-Tag`
 * header on every route in `vercel.json`.
 *
 * That was deliberate while the product was invite-only (see
 * docs/product/commercial-release-gate-2026-06-16.md). The gate was lifted on
 * 2026-08-11, which means the opposite problem now applies: a single-page app
 * serves the same HTML for every URL, so without an explicit canonical and an
 * explicit robots directive per page, `/pricing` and `/use-cases` look to a
 * crawler like duplicates of `/`.
 *
 * Rule: the canonical host is a constant, never `VITE_APP_URL`. Preview
 * deployments get their own hostname, and a preview that advertises itself as
 * canonical is a preview competing with production for the same query.
 */

/** Canonical origin. No trailing slash - `canonicalUrl` adds the path. */
export const SITE_URL = 'https://www.memoire-official.com';

export const SITE_NAME = 'Memoire';

/**
 * The one-line description used when a page does not give its own. Kept under
 * ~155 characters so a search result does not truncate mid-sentence.
 */
export const SITE_DESCRIPTION =
  'Memoire follows every customer thread from conversation to quote to delivery to cash, so nothing goes silent. $10 a month for one person.';

/**
 * Link-preview card.
 *
 * A PNG, and that is the point. This was an SVG until 2026-08-26, which meant
 * the card rendered in Slack, Discord and iMessage and nowhere a buyer is: not
 * X, not LinkedIn, not Facebook, not WhatsApp. None of them accept SVG as an
 * og:image, so every share of this product on the channel its own customers
 * live on came out as a grey box with a URL under it.
 *
 * Regenerate with `npm run generate:social-card` when the card changes; the
 * output is committed. `SITE_OG_IMAGE_TYPE` travels with it because a card
 * whose declared type does not match its bytes is refetched or dropped by
 * several scrapers.
 */
export const SITE_OG_IMAGE = `${SITE_URL}/social-card.png`;
export const SITE_OG_IMAGE_TYPE = 'image/png';
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 630;

/**
 * What the card shows, for a reader who cannot see it.
 *
 * `twitter:image:alt` and `og:image:alt` are read out by screen readers on the
 * platforms that support them, and a card with none is announced as "image".
 */
export const SITE_OG_IMAGE_ALT =
  'Memoire - Personal Commercial Control Tower. Nothing in your business goes silent.';

/**
 * Absolute URL for a route path.
 *
 * Trailing slashes are stripped (except for the root) because the app's router
 * treats `/pricing` and `/pricing/` as the same route while a crawler treats
 * them as two URLs.
 */
export function canonicalUrl(path: string): string {
  if (!path || path === '/') return `${SITE_URL}/`;
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return `${SITE_URL}${withoutTrailingSlash}`;
}

/**
 * The robots directive for a page that should be found.
 *
 * `max-snippet:-1` and `max-image-preview:large` are what let Google - and the
 * answer engines that read the same directive - quote more than a truncated
 * fragment. A product that is explained in prose loses if the explanation is
 * cut at 160 characters.
 */
export const ROBOTS_INDEXABLE = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

/** The directive for anything behind a login, or private to one recipient. */
export const ROBOTS_PRIVATE = 'noindex, nofollow';

/**
 * Every public URL worth crawling, in sitemap order.
 *
 * `scripts/verify-seo-contract.mjs` checks this list against the public routes
 * declared in `src/App.tsx`, so a new marketing page cannot ship invisible to
 * search, and a route that is removed cannot leave a 404 in the sitemap.
 *
 * `priority` is relative within this site only - it tells a crawler which of
 * our own pages matters most when it has budget for some but not all of them.
 */
export const PUBLIC_PAGES: { path: string; priority: number; changefreq: string }[] = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
  { path: '/pricing', priority: 0.9, changefreq: 'weekly' },
  { path: '/use-cases', priority: 0.9, changefreq: 'weekly' },
  { path: '/request-access', priority: 0.6, changefreq: 'monthly' },
  { path: '/legal/privacy', priority: 0.3, changefreq: 'yearly' },
  { path: '/legal/terms', priority: 0.3, changefreq: 'yearly' },
  { path: '/legal/boundaries', priority: 0.3, changefreq: 'yearly' },
];
