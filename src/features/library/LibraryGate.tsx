import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { evaluateLibraryActivation, type LibraryActivation } from '../../config/libraryActivation';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';

/**
 * Guards the Playbook and Asset library behind real workspace evidence.
 *
 * The gate is deliberately not a settings toggle and not a trial timer: it is
 * the workspace's own history. Until the seller has enough real outcomes for a
 * playbook to say anything true, showing one would be a shelf of empty
 * templates - which is exactly how a focused product starts looking like a
 * content suite.
 *
 * A demo workspace passes straight through, because the demo's whole job is to
 * show what a mature workspace looks like.
 */
export function LibraryGate({ title, children }: { title: string; children: ReactNode }) {
  const { user, loading: authLoading } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [activation, setActivation] = useState<LibraryActivation | null>(() => {
    const cached = getCachedSalesWorkspaceData(dataUserId);
    return cached ? evaluateLibraryActivation(cached) : null;
  });

  useEffect(() => {
    if (authLoading || sampleDataActive) return;
    let active = true;
    void loadSalesWorkspaceData(dataUserId)
      .then((workspace) => {
        if (active) setActivation(evaluateLibraryActivation(workspace));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [authLoading, dataUserId, sampleDataActive]);

  if (sampleDataActive) return <>{children}</>;

  if (!activation) {
    return (
      <SkeletonScreen label={`Loading ${title}`}>
        <div className="w-full px-4 py-5 sm:px-5 lg:px-6">
          <SkeletonCard />
        </div>
      </SkeletonScreen>
    );
  }

  if (activation.active) return <>{children}</>;

  return (
    <div className="w-full px-4 py-5 sm:px-5 lg:px-6">
      <section className="mx-auto max-w-2xl rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
        <Lock className="mx-auto h-6 w-6 text-gray-400" />
        <h1 className="mt-4 text-xl font-bold text-navy">{title} is not open yet</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">{activation.blockedReason}</p>
        <p className="mt-3 text-sm leading-6 text-gray-400">
          Nothing is missing and nothing was deleted - a library built from templates instead of your own outcomes would
          teach you nothing. Keep running the loop and it opens on its own.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/app/capture" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
            Capture activity
          </Link>
          <Link to="/app/today" className="rounded-full border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Back to Today
          </Link>
        </div>
      </section>
    </div>
  );
}
