import { useAuthContext } from '../../auth/authContext';
import { isDemoMode } from '../../lib/demoMode';
import { getDemoWorkspaceState } from '../../features/v31/localStore';
import { Button } from '../ui/Button';
import { Link } from 'react-router-dom';
import { getUserDisplayName } from '../../utils/userDisplay';

export function TopNav() {
  const { user, profile, signOut } = useAuthContext();
  const workspaceLabel = isDemoMode ? getDemoWorkspaceState()?.label || null : null;
  const displayName = getUserDisplayName(user, profile);

  return (
    <header className="fixed top-0 left-[220px] right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30">
      <div>
        {/* Breadcrumb or page title can go here */}
      </div>

      <div className="flex items-center gap-4">
        <Link
          to="/app/capture"
          className="rounded-full bg-navy px-3 py-1.5 text-sm font-bold text-white hover:bg-navy/90"
        >
          + Capture
        </Link>
        {workspaceLabel && (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            {workspaceLabel}
          </span>
        )}
        {user && (
          <>
            <span className="max-w-[220px] truncate text-sm text-gray-600" title={displayName}>{displayName}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
