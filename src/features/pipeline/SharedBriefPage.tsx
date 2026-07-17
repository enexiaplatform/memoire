import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { decodeSharedBriefFragment, type CompactSharedBrief } from '../../utils/shareableBriefLink';

// Public, read-only view of a Pipeline Defense brief shared by link. The brief
// data lives entirely in the URL hash (never sent to a server); this page just
// decodes and renders it. No auth, no workspace access.
export function SharedBriefPage() {
  const brief = useMemo<CompactSharedBrief | null>(
    () => decodeSharedBriefFragment(typeof window === 'undefined' ? '' : window.location.hash),
    [],
  );

  if (!brief) return <SharedBriefError />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-blue" />
            <span className="text-sm font-bold text-navy">Memoire · Shared Pipeline Defense Brief</span>
          </div>
          <Link to="/" className="text-xs font-semibold text-brand-blue hover:underline">What is Memoire?</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Manager review</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">{brief.title}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {[brief.weekLabel, brief.salesOwner, brief.scope].filter(Boolean).join(' · ')}
          {brief.generatedAt ? ` · Generated ${formatDateTime(brief.generatedAt)}` : ''}
        </p>
        <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Read-only snapshot shared by the sales owner. Figures reflect their workspace at generation time — confirm before acting externally.
        </p>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Deals reviewed" value={String(brief.summary.totalDeals)} />
          <Stat label="Defendable" value={String(brief.summary.defendableDeals)} tone="green" />
          <Stat label="Rescue" value={String(brief.summary.rescueDeals)} tone="amber" />
          <Stat label="Downgrade" value={String(brief.summary.downgradeDeals)} tone="red" />
        </section>
        <p className="mt-3 text-sm font-semibold text-gray-600">Pipeline value captured: {brief.summary.totalPipelineValueLabel}</p>

        <SharedSection title="Manager summary">
          <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-700">{brief.managerSummary}</pre>
        </SharedSection>

        {brief.summary.topRiskThemes.length > 0 && (
          <SharedSection title="Top risk themes">
            <ul className="flex flex-wrap gap-2">
              {brief.summary.topRiskThemes.map((theme) => (
                <li key={theme.label} className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{theme.label} ({theme.count})</li>
              ))}
            </ul>
          </SharedSection>
        )}

        <SharedSection title="Deal defense table">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="pb-2 pr-3">Account</th>
                  <th className="pb-2 pr-3">Opportunity</th>
                  <th className="pb-2 pr-3">Value</th>
                  <th className="pb-2 pr-3">Stage</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Main gap</th>
                  <th className="pb-2">Next defense action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {brief.dealRows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 font-bold text-navy">{row.account}</td>
                    <td className="py-2.5 pr-3 text-gray-700">{row.opportunity}</td>
                    <td className="py-2.5 pr-3 font-semibold text-gray-800">{row.value}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{row.currentStage}</td>
                    <td className="py-2.5 pr-3"><DefenseBadge status={row.defenseStatus} /></td>
                    <td className="py-2.5 pr-3 text-gray-600">{row.mainGap}</td>
                    <td className="py-2.5 text-gray-700">{row.nextDefenseAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SharedSection>

        {brief.nextActions.length > 0 && (
          <SharedSection title="Next defense actions">
            <ul className="space-y-2">
              {brief.nextActions.map((action, index) => (
                <li key={index} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{action.priority}</span>
                  <span className="font-bold text-navy">{action.account} / {action.opportunity}:</span> {action.title}
                </li>
              ))}
            </ul>
          </SharedSection>
        )}

        {brief.checklist.length > 0 && (
          <SharedSection title="Brief quality checklist">
            <ul className="space-y-1.5">
              {brief.checklist.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 text-xs font-bold ${item.status === 'pass' ? 'text-emerald-700' : 'text-amber-700'}`}>{item.status === 'pass' ? '✓' : '!'}</span>
                  <span><span className="font-semibold text-navy">{item.label}:</span> <span className="text-gray-600">{item.detail}</span></span>
                </li>
              ))}
            </ul>
          </SharedSection>
        )}

        <footer className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
          Shared with Memoire — the Personal Business Activity OS that keeps deals from going silent.
        </footer>
      </main>
    </div>
  );
}

function SharedBriefError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-navy">This shared brief could not be opened</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          The link may be incomplete or truncated. Ask the sender to copy the manager link again — the whole link,
          including the part after <code className="rounded bg-gray-100 px-1">#</code>, is needed.
        </p>
        <Link to="/" className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Go to Memoire</Link>
      </div>
    </div>
  );
}

function SharedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-navy';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-gray-500">{label}</p>
    </div>
  );
}

function DefenseBadge({ status }: { status: string }) {
  const tone = status === 'Defend' ? 'bg-emerald-50 text-emerald-700'
    : status === 'Rescue' ? 'bg-amber-50 text-amber-700'
      : status === 'Downgrade' ? 'bg-red-50 text-red-700'
        : 'bg-gray-100 text-gray-600';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{status}</span>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
