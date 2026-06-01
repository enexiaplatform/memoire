import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { loadInteractiveDemoWorkspace } from '../../features/v31/localStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, session, loading, signOut } = useAuth();
  const location = useLocation();
  const [slowLoad, setSlowLoad] = useState(false);
  const allowsLocalFirstAccess = isLocalFirstAppRoute(location.pathname);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoad(true), 9000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const openDemo = () => {
    loadInteractiveDemoWorkspace();
    window.location.replace('/app/dashboard');
  };

  if (allowsLocalFirstAccess) {
    return <>{children}</>;
  }

  if (loading) {
    if (slowLoad) {
      return (
        <LoadingFallback
          onRetry={() => window.location.reload()}
          onSignOut={() => {
            signOut();
            window.location.replace('/login');
          }}
          onOpenDemo={openDemo}
        />
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-memoire-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user && !session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function isLocalFirstAppRoute(pathname: string) {
  return [
    '/app/dashboard',
    '/app/demo-guide',
    '/app/validation-feedback',
    '/app/today',
    '/app/pipeline-defense',
    '/app/capture',
    '/app/calendar',
    '/app/reviews',
    '/app/playbook',
    '/app/assets',
    '/app/opportunities',
    '/app/onboarding/pipeline-review',
    '/app/stakeholders',
    '/app/objections',
    '/app/accounts',
    '/app/ask',
    '/app/journey',
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function LoadingFallback({
  onRetry,
  onSignOut,
  onOpenDemo,
}: {
  onRetry: () => void;
  onSignOut: () => void;
  onOpenDemo: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Loading fallback</p>
        <h1 className="mt-2 text-2xl font-bold text-navy">Memoire is taking longer than expected.</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          We could not finish loading your sales memory. You can retry, sign out, or open the demo workspace.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onRetry} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Retry
          </button>
          <button type="button" onClick={onSignOut} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
            Sign out
          </button>
          <button type="button" onClick={onOpenDemo} className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
            Open Demo Workspace
          </button>
        </div>
      </div>
    </div>
  );
}
