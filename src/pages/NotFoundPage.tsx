import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { BrandWordmark } from '../components/brand/BrandWordmark';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../hooks/useAuth';

export function NotFoundPage() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
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
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Return home
          </Link>
          <Link
            to={isAuthenticated ? '/app/today' : '/signup'}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
          >
            <LayoutDashboard className="h-4 w-4" />
            {isAuthenticated ? 'Open Today' : 'Start free trial'}
          </Link>
        </div>
      </section>
    </main>
  );
}
