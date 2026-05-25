import { useAuth } from '../../hooks/useAuth';
import { loadInteractiveDemoWorkspace } from './localStore';

export function RouteLoadingFallback({ onRetry }: { onRetry: () => void }) {
  const { signOut } = useAuth();

  const openDemo = () => {
    loadInteractiveDemoWorkspace();
    window.location.replace('/app/dashboard');
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Loading fallback</p>
      <h2 className="mt-2 text-xl font-bold text-navy">Memoire is taking longer than expected.</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-gray-600">
        We could not finish loading your sales memory. You can retry, sign out, or open the demo workspace.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Retry
        </button>
        <button
          type="button"
          onClick={() => {
            signOut();
            window.location.replace('/login');
          }}
          className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
        >
          Sign out
        </button>
        <button type="button" onClick={openDemo} className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
          Open Demo Workspace
        </button>
      </div>
    </div>
  );
}
