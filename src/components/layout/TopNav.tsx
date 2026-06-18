import { useEffect } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { Button } from '../ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { getUserDisplayName } from '../../utils/userDisplay';
import { Menu, Plus } from 'lucide-react';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { DataModePill } from '../common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { reportWorkspaceSyncError, useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus';
import { loadReviewPacksForUser } from '../../utils/reviewPacks';

export function TopNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, profile, signOut, loading, profileError, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const demoActive = useDemoWorkspaceMode();
  const syncStatus = useWorkspaceSyncStatus();
  const displayName = demoActive ? 'Demo workspace' : getUserDisplayName(user, profile);

  useEffect(() => {
    if (!user || demoActive) return;
    void loadReviewPacksForUser(user.id).catch(() => reportWorkspaceSyncError());
  }, [demoActive, user]);

  const handleSignOut = async () => {
    const result = await signOut();
    if (!result.error) {
      navigate('/', { replace: true });
    }
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-5 lg:left-[220px] lg:px-6">
      <button type="button" onClick={onOpenMenu} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 lg:hidden" title="Open navigation">
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <Link
          to="/app/capture"
          className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Capture</span>
        </Link>
        <DataModePill
          compact
          isLoading={loading || syncStatus.state === 'checking'}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={syncStatus.state !== 'error'}
          syncError={profileError || syncStatus.message}
          hasSampleData={demoActive}
        />
        {user && (
          <>
            <span className="hidden max-w-[220px] truncate text-sm text-gray-600 md:inline" title={displayName}>{displayName}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
