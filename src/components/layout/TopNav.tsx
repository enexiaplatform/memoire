import { useAuth } from '../../hooks/useAuth';
import { isDemoMode, isSupabaseConfigured } from '../../lib/demoMode';
import { getDemoWorkspaceState, getFounderWorkspaceState } from '../../features/v31/localStore';
import { Button } from '../ui/Button';
import { Link } from 'react-router-dom';

export function TopNav() {
  const { user, signOut } = useAuth();
  const workspaceLabel = isDemoMode ? getFounderWorkspaceState()?.label || getDemoWorkspaceState()?.label || null : null;

  return (
    <header className="fixed top-0 left-[220px] right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30">
      <div>
        {/* Breadcrumb or page title can go here */}
      </div>

      <div className="flex items-center gap-4">
        <Link
          to="/app/today#quick-capture"
          className="rounded-full bg-navy px-3 py-1.5 text-sm font-bold text-white hover:bg-navy/90"
        >
          + Capture
        </Link>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
          isDemoMode
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : isSupabaseConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
        }`} title={isDemoMode ? 'You are using sample Sales Memory.' : isSupabaseConfigured ? 'Your workspace is connected to cloud storage.' : 'Supabase setup is incomplete.'}>
          {isDemoMode ? 'Demo Mode' : isSupabaseConfigured ? 'Synced Mode' : 'Setup Required'}
        </span>
        {workspaceLabel && (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            {workspaceLabel}
          </span>
        )}
        {user && (
          <>
            <span className="text-sm text-gray-600">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
