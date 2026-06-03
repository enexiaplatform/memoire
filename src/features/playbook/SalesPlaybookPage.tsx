import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Copy, FileText, Loader2, Search } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { type ActionOutcomeRecord } from '../../services/actionOutcomeStore';
import { type ObjectionRecord } from '../../services/objectionStore';
import { type CrmLiteOpportunity } from '../../services/opportunityStore';
import { type SalesActivityRecord } from '../../services/salesActivityStore';
import { saveSalesAssetDraft } from '../../services/salesAssetStore';
import { type StakeholderRecord } from '../../services/stakeholderStore';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { hasLocalSampleData } from '../../utils/dataMode';
import { buildSalesAssetDraftFromPattern, generateAssetDraftMarkdown } from '../../utils/salesAssetSuggestions';
import {
  generatePlaybookPatternMarkdown,
  generateSalesPlaybookPatterns,
  playbookPatternCategories,
  playbookSeverities,
  summarizeSalesPlaybook,
  type SalesPlaybookPattern,
  type SalesPlaybookPatternCategory,
  type SalesPlaybookSeverity,
} from '../../utils/salesPlaybook';

const allFilter = 'All';

type PlaybookData = {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  actionOutcomes: ActionOutcomeRecord[];
};

export function SalesPlaybookPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const [data, setData] = useState<PlaybookData>({
    opportunities: [],
    activities: [],
    stakeholders: [],
    objections: [],
    actionOutcomes: [],
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SalesPlaybookPatternCategory | typeof allFilter>(allFilter);
  const [severityFilter, setSeverityFilter] = useState<SalesPlaybookSeverity | typeof allFilter>(allFilter);
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    let mounted = true;
    async function loadPlaybookData() {
      setLoading(true);
      const workspaceData = await loadSalesWorkspaceData(dataUserId);

      if (!mounted) return;
      setData({
        opportunities: workspaceData.opportunities,
        activities: workspaceData.activities,
        stakeholders: workspaceData.stakeholders,
        objections: workspaceData.objections,
        actionOutcomes: workspaceData.actionOutcomes,
      });
      setLoading(false);
    }

    if (!authLoading) {
      loadPlaybookData();
    }

    return () => {
      mounted = false;
    };
  }, [authLoading, dataUserId]);

  const patterns = useMemo(() => generateSalesPlaybookPatterns(data), [data]);
  const summary = useMemo(() => summarizeSalesPlaybook(patterns), [patterns]);
  const visiblePatterns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return patterns.filter((pattern) => {
      const searchable = [
        pattern.title,
        pattern.category,
        pattern.severity,
        pattern.whyItMatters,
        pattern.suggestedPlaybookResponse,
        pattern.reusableAction,
        pattern.evidence.join(' '),
        pattern.relatedAccounts.join(' '),
        pattern.relatedOpportunities.join(' '),
      ].join(' ').toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (categoryFilter === allFilter || pattern.category === categoryFilter) &&
        (severityFilter === allFilter || pattern.severity === severityFilter)
      );
    });
  }, [categoryFilter, patterns, search, severityFilter]);
  const selectedPattern = patterns.find((pattern) => pattern.id === selectedPatternId) || visiblePatterns[0] || null;

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`Copied ${label}.`);
    } catch {
      setCopyMessage(text);
    }
  };

  const createAssetDraft = (pattern: SalesPlaybookPattern) => {
    saveSalesAssetDraft(buildSalesAssetDraftFromPattern(pattern));
    setCopyMessage('Asset draft ready. Opening Assets...');
    window.setTimeout(() => navigate('/app/assets'), 120);
  };

  const copyAssetDraft = (pattern: SalesPlaybookPattern) => {
    const draft = buildSalesAssetDraftFromPattern(pattern);
    copyText('asset draft', generateAssetDraftMarkdown(draft));
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Playbook</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Personal Sales Playbook</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Reusable sales patterns from objections, stakeholders, MEDDIC gaps, outcomes, and captured activity. Rule-based only.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading || loading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={isSupabaseConfigured}
          hasSampleData={sampleDataActive}
        />
      </header>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building playbook patterns...
        </div>
      ) : patterns.length === 0 ? (
        <PlaybookEmptyState />
      ) : (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-navy">Pattern Library</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Derived from existing Memoire data. No separate knowledge base or manual sync required.
                </p>
              </div>
              {copyMessage && (
                <span className="max-w-xl truncate rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                  {copyMessage.startsWith('Copied') ? copyMessage : 'Copy failed - text shown here.'}
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard label="Patterns" value={summary.totalPatterns} />
              <SummaryCard label="High severity" value={summary.highSeverityCount} tone={summary.highSeverityCount ? 'red' : 'green'} />
              <SummaryCard label="Objections" value={summary.objectionPatternCount} tone={summary.objectionPatternCount ? 'amber' : 'green'} />
              <SummaryCard label="Stakeholder gaps" value={summary.stakeholderGapCount} tone={summary.stakeholderGapCount ? 'amber' : 'green'} />
              <SummaryCard label="Winning moves" value={summary.winningMoveCount} tone={summary.winningMoveCount ? 'green' : 'blue'} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_180px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:bg-white"
                  placeholder="Search pattern, account, objection, or playbook response"
                />
              </label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as SalesPlaybookPatternCategory | typeof allFilter)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:bg-white"
              >
                <option value={allFilter}>All categories</option>
                {playbookPatternCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value as SalesPlaybookSeverity | typeof allFilter)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:bg-white"
              >
                <option value={allFilter}>All severity</option>
                {playbookSeverities.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
              </select>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-500">{visiblePatterns.length} visible patterns</p>
                <Link to="/app/reviews" className="text-sm font-bold text-brand-blue">Open Reviews</Link>
              </div>
              {visiblePatterns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
                  <p className="text-sm font-bold text-navy">No pattern matches this filter.</p>
                  <p className="mt-2 text-sm text-gray-500">Clear filters or capture more activity to build the playbook.</p>
                </div>
              ) : (
                visiblePatterns.map((pattern) => (
                  <PatternCard
                    key={pattern.id}
                    pattern={pattern}
                    isSelected={selectedPattern?.id === pattern.id}
                    onSelect={() => setSelectedPatternId(pattern.id)}
                    onCopy={(label, text) => copyText(label, text)}
                    onCreateAssetDraft={() => createAssetDraft(pattern)}
                    onCopyAssetDraft={() => copyAssetDraft(pattern)}
                  />
                ))
              )}
            </div>

            <PatternDetailPanel
              pattern={selectedPattern}
              onCopy={(label, text) => copyText(label, text)}
              onCreateAssetDraft={selectedPattern ? () => createAssetDraft(selectedPattern) : undefined}
              onCopyAssetDraft={selectedPattern ? () => copyAssetDraft(selectedPattern) : undefined}
            />
          </section>
        </>
      )}
    </div>
  );
}

function PatternCard({
  pattern,
  isSelected,
  onSelect,
  onCopy,
  onCreateAssetDraft,
  onCopyAssetDraft,
}: {
  pattern: SalesPlaybookPattern;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: (label: string, text: string) => void;
  onCreateAssetDraft: () => void;
  onCopyAssetDraft: () => void;
}) {
  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm ${isSelected ? 'border-brand-blue ring-2 ring-blue-100' : 'border-gray-200'}`}>
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex flex-wrap gap-2">
          <Badge label={pattern.category} tone="blue" />
          <Badge label={pattern.severity} tone={severityTone(pattern.severity)} />
          <Badge label={`${pattern.frequency}x`} tone="gray" />
        </div>
        <h2 className="mt-3 text-lg font-bold text-navy">{pattern.title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">{pattern.whyItMatters}</p>
        {pattern.evidence[0] && (
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-600">{pattern.evidence[0]}</p>
        )}
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-brand-blue">
          Suggested Asset Needed: {buildSalesAssetDraftFromPattern(pattern).assetType}
        </p>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCopy('playbook response', pattern.suggestedPlaybookResponse)}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy Response
        </button>
        <button
          type="button"
          onClick={() => onCopy('pattern summary', generatePlaybookPatternMarkdown(pattern))}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy Summary
        </button>
        <button
          type="button"
          onClick={onCreateAssetDraft}
          className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-100"
        >
          <FileText className="h-3.5 w-3.5" />
          Create Asset Draft
        </button>
        <button
          type="button"
          onClick={onCopyAssetDraft}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy Asset Draft
        </button>
      </div>
    </article>
  );
}

function PatternDetailPanel({
  pattern,
  onCopy,
  onCreateAssetDraft,
  onCopyAssetDraft,
}: {
  pattern: SalesPlaybookPattern | null;
  onCopy: (label: string, text: string) => void;
  onCreateAssetDraft?: () => void;
  onCopyAssetDraft?: () => void;
}) {
  if (!pattern) {
    return (
      <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-navy">Select a pattern</p>
        <p className="mt-2 text-sm text-gray-500">Open a playbook pattern to see evidence and reusable action guidance.</p>
      </aside>
    );
  }

  return (
    <aside className="sticky top-6 h-fit rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <BookOpen className="h-5 w-5" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge label={pattern.category} tone="blue" />
        <Badge label={pattern.severity} tone={severityTone(pattern.severity)} />
        <Badge label={`${pattern.frequency}x`} tone="gray" />
      </div>
      <h2 className="mt-3 text-xl font-bold text-navy">{pattern.title}</h2>

      <DetailBlock title="Evidence" items={pattern.evidence} />
      <DetailBlock title="Why it matters" items={[pattern.whyItMatters]} />
      <DetailBlock title="Suggested response" items={[pattern.suggestedPlaybookResponse]} />
      <DetailBlock title="Reusable action" items={[pattern.reusableAction]} />
      <DetailBlock title="Suggested asset needed" items={[`${buildSalesAssetDraftFromPattern(pattern).assetType}: ${buildSalesAssetDraftFromPattern(pattern).title}`]} />
      {pattern.relatedAccounts.length > 0 && <DetailBlock title="Accounts" items={pattern.relatedAccounts} />}
      {pattern.relatedOpportunities.length > 0 && <DetailBlock title="Opportunities" items={pattern.relatedOpportunities} />}

      <div className="mt-5 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => onCopy('playbook response', pattern.suggestedPlaybookResponse)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
        >
          <Copy className="h-4 w-4" />
          Copy Playbook Response
        </button>
        <button
          type="button"
          onClick={() => onCopy('reusable action', pattern.reusableAction)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
        >
          <Copy className="h-4 w-4" />
          Copy Reusable Action
        </button>
        <button
          type="button"
          onClick={() => onCopy('pattern summary', generatePlaybookPatternMarkdown(pattern))}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
        >
          <Copy className="h-4 w-4" />
          Copy Pattern Summary
        </button>
        <button
          type="button"
          onClick={onCreateAssetDraft}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue"
        >
          <FileText className="h-4 w-4" />
          Create Asset Draft
        </button>
        <button
          type="button"
          onClick={onCopyAssetDraft}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
        >
          <Copy className="h-4 w-4" />
          Copy Asset Draft
        </button>
      </div>
    </aside>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-gray-600">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function SummaryCard({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-2xl font-black ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneMap}`}>{label}</span>;
}

function PlaybookEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <BookOpen className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-navy">No playbook patterns yet.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Add opportunities, capture sales activities, record objections, and mark action outcomes. Memoire will derive reusable sales patterns from that data.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/app/capture" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Capture Activity</Link>
        <Link to="/app/opportunities" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Open Opportunities</Link>
      </div>
    </section>
  );
}

function severityTone(severity: SalesPlaybookSeverity) {
  if (severity === 'High') return 'red';
  if (severity === 'Medium') return 'amber';
  return 'green';
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}
