import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandWordmark } from '../components/brand/BrandWordmark';
import { NoIndex } from '../components/marketing/PageSeo';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../hooks/useAuth';

export function NotFoundPage() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useDocumentTitle('Page not found');

  /**
   * A mistyped route inside the app is still somewhere in the app.
   *
   * Rendered full-bleed, this page took the rail and the header with it, so
   * `/app/review` - a plausible guess at `/app/reviews` - dropped the operator
   * out of the product entirely and offered "Return home" as the way back. Under
   * `/app` it renders inside the shell instead and keeps the way out visible.
   */
  const insideApp = location.pathname.startsWith('/app');

  return (
    <>
    {/* A single-page app cannot return a 404 status: the host rewrites every
        unmatched URL to index.html, which is a 200. Without this, every typo,
        every dead inbound link and every stale bookmark becomes an indexable
        page that says "this page could not be found" - a soft 404, and Google
        counts them against the whole site. The meta tag is the only 404 signal
        this architecture can send. */}
    <NoIndex />
    <main className={insideApp
      ? 'flex w-full items-center justify-center px-4 py-16 text-slate-950'
      : 'flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-950'}
    >
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {!insideApp && (
          <Link to="/" aria-label="Memoire home">
            <BrandWordmark className="text-2xl" />
          </Link>
        )}
        <p className={`text-xs font-bold uppercase tracking-[0.2em] text-brand-blue ${insideApp ? '' : 'mt-8'}`}>404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">This page could not be found.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The link may be outdated, or the page may have moved.
        </p>
        {/*
         * The way out is chosen by where the operator IS, not by whether they
         * hold an account.
         *
         * Both buttons used to branch on `isAuthenticated`, so the product's own
         * browser-only mode - no account, by design, with a real workspace in
         * this browser - mistyped a route and was handed "Start free trial" and
         * a link to the marketing homepage. Neither leads back to their records,
         * and the trial being offered does not exist: checkout is shut for the
         * duration of the free preview (src/config/launchPhase.ts), which is why
         * every public CTA says "Start free".
         */}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {insideApp ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </button>
          ) : (
            <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
              Return home
            </Link>
          )}
          <Link
            to={insideApp || isAuthenticated ? '/app/today' : '/signup'}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
          >
            <LayoutDashboard className="h-4 w-4" />
            {insideApp || isAuthenticated ? 'Open Today' : 'Start free'}
          </Link>
        </div>
      </section>
    </main>
    </>
  );
}
