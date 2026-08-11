import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { AuthContext, type AuthContextValue } from './auth/authContext';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './features/pricing/PricingPage';
import { UseCasesPage } from './features/useCases/UseCasesPage';
import { LegalPage } from './features/legal/LegalPage';
import { EarlyAccessRequestPage } from './features/earlyAccess/EarlyAccessRequestPage';

/**
 * The server half of the marketing site.
 *
 * ## Why this exists
 *
 * Memoire ships as a single-page app: one `index.html` with an empty
 * `<div id="root">`, and every word on every page arrives later as JavaScript.
 * Googlebot renders JavaScript, so that was survivable while search was the
 * only audience. It stopped being survivable when the answer engines became an
 * audience - GPTBot, ClaudeBot and PerplexityBot fetch HTML and do not execute
 * it. To all three, this site was a blank page with a title.
 *
 * So every public marketing surface is rendered to real HTML at build time and
 * written as a static file. A crawler gets the whole page from the first byte;
 * the browser still boots the same SPA over the top.
 *
 * ## Why only these routes
 *
 * Everything here renders from constants in its own module and touches no
 * browser API - `MarketingNav`'s `useState` is the only hook in the set, and it
 * has a static initial value. That is what makes them safe to render in Node.
 *
 * `/request-access` is here too, despite being a form: every browser API its
 * modules touch - localStorage, fetch, setTimeout - is inside a function body,
 * so nothing runs at import time. Leaving it out was the first plan, and the
 * reason it came back is duplicate metadata: a client-rendered page keeps the
 * template's default description *and* adds its own, and this was the only
 * indexable page that would have shipped two.
 *
 * ## The contract
 *
 * `scripts/prerender.mjs` consumes this. `scripts/verify-seo-contract.mjs`
 * checks that every route below is also in `PUBLIC_PAGES` in
 * `src/config/seo.ts`, so a page cannot be prerendered but left out of the
 * sitemap, or listed in the sitemap and never rendered.
 */

/**
 * Re-exported so `scripts/prerender.mjs` reads the sitemap's URL list from the
 * same TypeScript module the app does, instead of keeping a second copy in
 * plain JS that nothing stops from drifting.
 */
export { PUBLIC_PAGES, SITE_URL } from './config/seo';

/** Route paths rendered to static HTML at build time. */
export const PRERENDER_ROUTES = [
  '/',
  '/pricing',
  '/use-cases',
  '/request-access',
  '/legal/privacy',
  '/legal/terms',
  '/legal/boundaries',
] as const;

/**
 * A settled, signed-out session.
 *
 * `MarketingNav` asks whether the visitor is already logged in so it can offer
 * "Open workspace" instead of "Create Account". A crawler is never logged in,
 * so that is what it is told - and `loading: false` matters: left true, the nav
 * would render its in-between state into permanent HTML.
 *
 * The real `AuthProvider` is not used because it opens a Supabase session on
 * mount, which a build step has no business doing. The action methods below are
 * unreachable: nothing calls them during a render, and there is no browser here
 * to click them.
 */
const notSignedIn: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  profileLoading: false,
  profileError: null,
  loading: false,
  error: null,
  isAuthenticated: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  requestPasswordReset: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  updateDisplayName: async () => ({ error: null }),
  resendSignupConfirmation: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

/**
 * Render one route to markup.
 *
 * `renderToStaticMarkup` rather than `renderToString`: nothing here hydrates.
 * The client calls `createRoot().render()`, which replaces the container's
 * contents outright, so hydration markers would be bytes shipped to every
 * visitor for a reconciliation that never happens.
 *
 * A `HelmetProvider` still wraps the tree because the pages use `<PageSeo />`,
 * and on React 19 that renders its tags as ordinary elements inline. The caller
 * lifts them out of this markup and into the document head - see
 * `scripts/prerender.mjs`.
 */
export function renderRoute(url: string): string {
  return renderToStaticMarkup(
    <HelmetProvider>
      <AuthContext.Provider value={notSignedIn}>
        <StaticRouter location={url}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/use-cases" element={<UseCasesPage />} />
            <Route path="/request-access" element={<EarlyAccessRequestPage />} />
            <Route path="/legal/:document" element={<LegalPage />} />
          </Routes>
        </StaticRouter>
      </AuthContext.Provider>
    </HelmetProvider>,
  );
}
