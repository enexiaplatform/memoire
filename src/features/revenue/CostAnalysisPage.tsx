import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
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
export function CostAnalysisPage({ tabs }: { tabs?: ReactNode } = {}) {
  const { user, loading: authLoading } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  // Paint from the workspace already in memory rather than holding the page
  // blank; the load below still runs and replaces it.
  const cached = getCachedSalesWorkspaceData(dataUserId);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>(cached?.opportunities || []);
  const [quotes, setQuotes] = useState<QuoteRecord[]>(cached?.quotes || []);
  // The close dates. Without them the margin trend files every imported order
  // in the month it was imported.
  const [opportunityOutcomes, setOpportunityOutcomes] = useState<OpportunityOutcomeRecord[]>(cached?.opportunityOutcomes || []);
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
      setOpportunityOutcomes(workspace.opportunityOutcomes);
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
      setOpportunityOutcomes(workspace.opportunityOutcomes);
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
        tabs={tabs}
        eyebrow="Money"
        title="Margin"
        documentTitle="Money · Margin"
        description="What your committed orders cost you, against what you sold them for. Orders follows the money to the bank; this says whether the work paid. Yours only — nothing here changes an order or reaches a customer."
        actions={
          /* The link to Orders is gone: it is the tab immediately to the left
             of this view's own tab, on the same page. */
          <button
            type="button"
            onClick={() => { void reload(); }}
            disabled={syncing}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700 disabled:opacity-60"
            title="Reload orders from cloud"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        }
          /*
           * No per-page sync chrome.
           *
           * The app header carries one sync state for the whole workspace, and
           * every page that repeated it added a second answer to "am I synced"
           * on the same screen - a green "Cloud sync" pill beside a grey
           * "Browser only" pill was a real screenshot. Normal is quiet; a
           * genuine failure still speaks, in this page's own error state, where
           * it can say what failed and offer the retry.
           */
      />

      {loading ? (
        <SkeletonScreen label="Loading cost analysis">
          <SkeletonCard lines={4} />
        </SkeletonScreen>
      ) : (
        <CostAnalysisPanel
          opportunities={opportunities}
          quotes={quotes}
          outcomes={opportunityOutcomes}
          dataUserId={dataUserId}
          sampleDataActive={sampleDataActive}
        />
      )}
    </PageContainer>
  );
}
