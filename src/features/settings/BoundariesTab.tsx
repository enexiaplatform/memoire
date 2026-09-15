import { Link } from 'react-router-dom';
import { ArrowRight, Check, Cloud, Globe, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { getDataModeInfo, hasLocalSampleData } from '../../utils/dataMode';
import { useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus';
import { getCachedSalesWorkspaceData } from '../../services/workspaceData';
import { formatCount } from '../../utils/numberFormat';
import { GradientEdge, MicroPill, Panel } from '../../components/ui/daylight';

const notItems = [
  'A professional certification, hiring score, or credit signal',
  'A replacement for your company CRM or system of record',
  'An automated sender of customer communication',
  'An invoicing, inventory, ecommerce, marketplace, or project-delivery management system',
];

const boundaries = [
  'No CRM writeback, enterprise SSO, team administration, or manager scoring is available today.',
  // This line said "AI-assisted text may be sent to the configured provider
  // only when you explicitly use that feature" until 2026-08-11 - written when
  // there was a provider, and left behind when it was removed. It told a paying
  // operator their notes might leave the device, which is the opposite of what
  // happens and the opposite of what the product is sold on.
  'Nothing you write is sent to an AI service. There is no AI provider, key or endpoint in Memoire; capture parses on this device and Search & Insights computes from your own records.',
  'Local browser data can be lost when browser storage is cleared. Keep exports of business-critical information.',
];

const rights = [
  'Export available cloud and browser workspace data from Export & Delete.',
  'Delete your signed-in account and clear Memoire data stored in this browser.',
  'Use local mode without signing in, with the limitations of browser-only storage.',
  'Review the evidence behind rule-based risk and opportunity-quality signals.',
];

/**
 * The product's boundaries in its own words.
 *
 * Laid out as the Daylight mock drew it: what Memoire is not on the left, the
 * boundary statement in the gradient-edged card on the right, then where the
 * records actually live and the one destructive door. The sentences are the
 * same sentences - the trust contract pins them - and only their arrangement
 * changed.
 */
export function BoundariesTab({ onOpenExport }: { onOpenExport: () => void }) {
  const [aiStatement, ...otherBoundaries] = [boundaries[1], boundaries[0], boundaries[2]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-ink">Data and Product Boundaries</h2>
        <p className="mt-1.5 text-[13px] leading-6 text-muted">
          Understand what Memoire stores, what remains local, and where human review is required.
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="px-[22px] py-5">
            <h3 className="font-display text-base font-bold text-ink">Memoire is not</h3>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted">Said as plainly here as it is on the landing page.</p>
            <MarkedList items={notItems} marker="No" tone="red" />
          </Panel>

          <Panel className="px-[22px] py-5">
            <h3 className="font-display text-base font-bold text-ink">Your controls</h3>
            <MarkedList items={rights} marker="Yes" tone="green" />
            <div className="mt-4 border-t border-line-soft pt-3.5">
              <Link to="/legal/boundaries" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-blue hover:text-navy">
                View full product boundaries
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <GradientEdge innerClassName="px-[22px] py-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-blue" aria-hidden="true" />
              <h3 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-brand-blue">Current product boundaries</h3>
            </div>
            <p className="mt-3 text-[13.5px] leading-[1.6] text-ink [text-wrap:pretty]">{aiStatement}</p>
            <ul className="mt-3.5 space-y-2.5">
              {otherBoundaries.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[12.5px] leading-[1.55] text-tint-neutral-ink">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tint-green-solid" strokeWidth={2.6} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </GradientEdge>

          <StorageModeCard />

          <section className="rounded-panel bg-tint-red-bg px-5 py-[18px]" aria-label="Danger zone">
            <h3 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tint-red-solid">Danger zone</h3>
            <p className="mt-2 text-[12.5px] leading-[1.55] text-tint-red-ink">
              Deleting your account clears Memoire data stored in this browser and your signed-in cloud workspace.
              Export first - this cannot be undone.
            </p>
            {/* A door to the flow that asks twice, not a second delete button.
                The confirmation, the typed DELETE and the export beside it all
                live on that tab; a shortcut that skipped them would be the one
                path to losing a workspace by accident. */}
            <button
              type="button"
              onClick={onOpenExport}
              className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-tint-red-solid px-4 py-2 font-display text-[12.5px] font-semibold text-white transition hover:-translate-y-px"
            >
              Export, then delete
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function MarkedList({ items, marker, tone }: { items: string[]; marker: string; tone: 'red' | 'green' }) {
  return (
    <ul className="mt-3.5 flex flex-col">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 border-b border-line-soft py-2.5 last:border-b-0 last:pb-0">
          <MicroPill tone={tone} className="mt-0.5">{marker}</MicroPill>
          <span className="text-[12.5px] leading-[1.55] text-ink">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where this workspace's records live right now, read from the same status the
 * top bar's chip reads - so the two can never disagree about it.
 */
function StorageModeCard() {
  const { isAuthenticated, loading, user } = useAuthContext();
  const syncStatus = useWorkspaceSyncStatus();
  const sampleData = hasLocalSampleData();
  const info = getDataModeInfo({
    isAuthenticated,
    isSupabaseConfigured,
    syncError: syncStatus.state === 'error' ? syncStatus.message || 'Cloud sync is unavailable.' : null,
    hasSampleData: sampleData,
    isLoading: loading || syncStatus.state === 'checking',
  });
  const cloudActive = info.mode === 'synced';
  const workspace = getCachedSalesWorkspaceData(sampleData ? undefined : user?.id);
  const counts = workspace
    ? `${formatCount(workspace.accounts.length)} accounts, ${formatCount(workspace.opportunities.length)} deals`
    : '';

  return (
    <Panel className="px-[22px] py-5">
      <h3 className="font-display text-base font-bold text-ink">Storage</h3>
      <div className={`mt-3.5 flex items-center gap-3 rounded-[13px] px-3.5 py-3 ${cloudActive ? '' : 'bg-tint-neutral-bg'}`}>
        <span className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${cloudActive ? 'bg-[#E8F8F0] text-tint-green-solid' : 'bg-chip text-tint-neutral-ink'}`}>
          <Cloud className="h-[17px] w-[17px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Cloud + browser</span>
          <span className="block text-[11.5px] text-muted">
            {cloudActive
              ? `Records sync to your account${counts ? ` · ${counts}` : ''}`
              : info.mode === 'sync-error'
                ? 'Signed in, but the cloud is not answering right now'
                : 'Sign in to keep records on your account as well'}
          </span>
        </span>
        {cloudActive && <MicroPill tone="green">Active</MicroPill>}
        {info.mode === 'sync-error' && <MicroPill tone="red">Sync issue</MicroPill>}
      </div>
      <div className={`mt-2 flex items-center gap-3 rounded-[13px] px-3.5 py-3 ${cloudActive ? 'bg-tint-neutral-bg' : ''}`}>
        <span className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${cloudActive ? 'bg-chip text-tint-neutral-ink' : 'bg-tint-amber-pill text-tint-amber-solid'}`}>
          <Globe className="h-[17px] w-[17px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Browser only</span>
          <span className="block text-[11.5px] text-muted">
            {sampleData
              ? 'The demo sandbox lives only in this browser'
              : 'Browser-only storage, with the limitations that carries'}
          </span>
        </span>
        {!cloudActive && info.mode !== 'sync-error' && info.mode !== 'loading' && <MicroPill tone="amber">Active</MicroPill>}
      </div>
    </Panel>
  );
}
