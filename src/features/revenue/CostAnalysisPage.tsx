import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { isSupabaseConfigured } from '../../lib/demoMode';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { hasLocalSampleData } from '../../utils/dataMode';
import { CostAnalysisPanel } from './CostAnalysisPanel';

/**
 * Cost analysis, as its own destination.
 *
 * It shipped as a block inside Orders, under the order book it prices, and that
 * was the right shape on paper and the wrong one in practice: the founder went
 * looking for it in the navigation, did not find a row, and concluded the
 * feature had not been built. A capability nobody can find is not a capability,
 * and "it is further down the page you were already on" is an argument that
 * loses to what someone actually does.
 *
 * So it is a rail item, and Orders is left doing one job again. The two pages
 * still read one book: this page derives the same committed orders from the
 * same `buildOrderBook`, and owns only the purchase costs recorded against them.
 * It is `status: 'global'` rather than a seventh primary destination for the
 * ordinary reason - you do not run the day here, you come to ask whether the
 * work was worth doing.
 */
export function CostAnalysisPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  // Paint from the workspace already in memory rather than holding the page
  // blank; the load below still runs and replaces it.
  const cached = getCachedSalesWorkspaceData(dataUserId);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>(cached?.opportunities || []);
  const [quotes, setQuotes] = useState<QuoteRecord[]>(cached?.quotes || []);
  const [loading, setLoading] = useState(!cached);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(!getCachedSalesWorkspaceData(dataUserId));
    void loadSalesWorkspaceData(dataUserId).then((workspace) => {
      if (cancelled) return;
      setOpportunities(workspace.opportunities);
      setQuotes(workspace.quotes);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading, dataUserId]);

  const reload = async () => {
    setSyncing(true);
    try {
      const workspace = await loadSalesWorkspaceData(dataUserId, { force: true });
      setOpportunities(workspace.opportunities);
      setQuotes(workspace.quotes);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <PageContainer>
      {/* The second sentence is the boundary between this page and Orders, and
          it is load bearing: Orders answers "where is my money", this answers
          "was it worth it". Two pages that both claim to be about orders is how
          an operator stops knowing which one to open. */}
      <PageHeader
        eyebrow="Records"
        title="Cost analysis"
        description="What your committed orders cost you, against what you sold them for. Orders follows the money to the bank; this says whether the work paid. Yours only — nothing here changes an order or reaches a customer."
        actions={
          <>
            <Link
              to="/app/revenue"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Orders
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => { void reload(); }}
              disabled={syncing}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
              title="Reload orders from cloud"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <DataModePill
              compact
              isLoading={authLoading || loading}
              isAuthenticated={isAuthenticated}
              isSupabaseConfigured={isSupabaseConfigured}
              cloudAvailable={isSupabaseConfigured}
              hasSampleData={sampleDataActive}
            />
          </>
        }
      />

      {loading ? (
        <SkeletonScreen label="Loading cost analysis">
          <SkeletonCard lines={4} />
        </SkeletonScreen>
      ) : (
        <CostAnalysisPanel
          opportunities={opportunities}
          quotes={quotes}
          dataUserId={dataUserId}
          sampleDataActive={sampleDataActive}
        />
      )}
    </PageContainer>
  );
}
