import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Grid3x3 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import type { AccountMergeRecord } from '../../services/accountMergeStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import {
  buildCoverageMatrix,
  coverageCellLabel,
  type CoverageCell,
  type CoverageCellState,
} from '../../utils/coverageMatrix';
import { formatBaseCurrencyAmount } from '../../utils/money';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';

/**
 * The Business Vault: every customer against every line you carry.
 *
 * The first version of this page drew the same records as a force-directed
 * graph. It was accurate and useless - it showed an operator their own customer
 * list arranged in a circle. This shows the one thing the records contain that
 * nobody can hold in their head: which of the customer x line squares have
 * never been filled.
 */

const stateStyles: Record<CoverageCellState, string> = {
  won: 'bg-emerald-500 text-white',
  committed: 'bg-violet-500 text-white',
  active: 'bg-blue-500 text-white',
  lost: 'bg-gray-200 text-gray-500',
  // The empty square is the message of this page, so it has to read as a slot
  // that is deliberately unfilled rather than as blank card. A dashed outline
  // over a faint fill does that; a `ring` cannot be dashed at all, which is how
  // the first attempt ended up invisible on a white card.
  none: 'border border-dashed border-gray-300 bg-gray-50 text-gray-300',
};

export function BusinessVaultPage() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  // `null` is this page's "still loading" state, so seeding it from the cache
  // is what stops the grid appearing empty on every arrival.
  const cachedWorkspace = getCachedSalesWorkspaceData(dataUserId);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[] | null>(
    cachedWorkspace?.opportunities || null,
  );
  const [accountMerges, setAccountMerges] = useState<AccountMergeRecord[]>(cachedWorkspace?.accountMerges || []);

  useEffect(() => {
    let cancelled = false;
    void loadSalesWorkspaceData(dataUserId).then((workspace) => {
      if (cancelled) return;
      setOpportunities(workspace.opportunities);
      setAccountMerges(workspace.accountMerges);
    });
    return () => { cancelled = true; };
  }, [dataUserId]);

  // A customer merged in Accounts has to be one row here. Without the merges
  // this page drew the same customer twice, splitting their squares across two
  // rows and inventing gaps in both.
  const matrix = useMemo(
    () => buildCoverageMatrix({
      opportunities: opportunities || [],
      accountAliases: buildAccountAliasIndex(accountMerges),
    }),
    [opportunities, accountMerges],
  );

  if (!opportunities) {
    return (
      <SkeletonScreen label="Reading your coverage">
        <div className="w-full px-4 py-5 sm:px-5 lg:px-6"><SkeletonCard /></div>
      </SkeletonScreen>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-5 lg:px-6">
      <header>
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-5 w-5 text-brand-blue" />
          <h1 className="text-2xl font-bold tracking-tight text-navy">Business Vault</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
          Every customer against every line you carry. The filled squares are the business you have; the empty ones are
          the business you have never asked for.
        </p>
      </header>

      {!matrix.hasEnoughBrands ? (
        <EmptyState brandCount={matrix.brands.length} />
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-2xl font-black text-navy">
                  {matrix.filledCells}
                  <span className="text-base font-bold text-gray-400"> / {matrix.totalCells} squares filled</span>
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {matrix.rows.length} customers &times; {matrix.brands.length} lines.
                  {' '}
                  {matrix.totalCells - matrix.filledCells} combinations you have never taken to the customer.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-brand-blue">
                {Math.round(matrix.penetration * 100)}% covered
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="border-separate border-spacing-1 text-left text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white pr-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      Customer
                    </th>
                    {matrix.brands.map((brand) => (
                      <th key={brand} className="px-1 pb-1 text-center text-[11px] font-bold text-navy">
                        <span className="block max-w-[92px] truncate" title={brand}>{brand}</span>
                      </th>
                    ))}
                    <th className="pl-3 text-right text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      Relationship
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.accountName}>
                      <td className="sticky left-0 z-10 max-w-[190px] truncate bg-white pr-3 font-bold text-navy" title={row.accountName}>
                        <Link
                          to={`/app/accounts?accountName=${encodeURIComponent(row.accountName)}`}
                          className="hover:text-brand-blue hover:underline"
                        >
                          {row.accountName}
                        </Link>
                      </td>
                      {row.cells.map((cell) => <MatrixCell key={cell.brand} cell={cell} />)}
                      <td className="whitespace-nowrap pl-3 text-right text-xs font-bold text-gray-600">
                        {row.relationshipValueBase > 0 ? formatBaseCurrencyAmount(row.relationshipValueBase, true) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Legend />
          </section>

          {matrix.gaps.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-navy">The gaps worth closing first</h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-600">
                Customers who already buy from you and carry only part of the range. A line missing at a customer who
                already trusts you is a shorter conversation than a new logo.
              </p>
              <ul className="mt-3 space-y-2">
                {matrix.gaps.map((gap) => (
                  <li key={gap.accountName} className="rounded-lg border border-amber-100 bg-white px-3.5 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        to={`/app/accounts?accountName=${encodeURIComponent(gap.accountName)}`}
                        className="font-bold text-navy hover:text-brand-blue hover:underline"
                      >
                        {gap.accountName}
                      </Link>
                      <span className="text-xs font-bold text-gray-500">
                        {formatBaseCurrencyAmount(gap.relationshipValueBase, true)} · {gap.brandsTouched} of {matrix.brands.length} lines
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-amber-900">
                      Never offered: {gap.missingBrands.join(', ')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MatrixCell({ cell }: { cell: CoverageCell }) {
  const money = cell.wonValueBase || cell.activeValueBase;
  const title = `${cell.accountName} · ${cell.brand} — ${coverageCellLabel(cell.state)}${
    money > 0 ? ` · ${formatBaseCurrencyAmount(money, true)}` : ''
  }`;

  const content = (
    <span className={`flex h-9 min-w-[64px] items-center justify-center rounded px-1.5 text-[11px] font-bold ${stateStyles[cell.state]}`}>
      {money > 0 ? formatBaseCurrencyAmount(money, true).replace(/\s*\(.*\)$/, '') : cell.state === 'none' ? '' : '·'}
    </span>
  );

  return (
    <td className="p-0" title={title}>
      {cell.href ? (
        <Link to={cell.href} className="block transition hover:opacity-80">{content}</Link>
      ) : (
        content
      )}
    </td>
  );
}

function Legend() {
  const items: { state: CoverageCellState; label: string }[] = [
    { state: 'won', label: 'Won' },
    { state: 'committed', label: 'Committed to order' },
    { state: 'active', label: 'In play' },
    { state: 'lost', label: 'Tried and lost' },
    { state: 'none', label: 'Never taken to them' },
  ];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-gray-500">
      {items.map((item) => (
        <span key={item.state} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3 w-5 rounded ${stateStyles[item.state]}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ brandCount }: { brandCount: number }) {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
      <h2 className="text-lg font-bold text-navy">
        {brandCount === 0 ? 'No lines recorded yet.' : 'Only one line recorded so far.'}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        This page compares the lines you carry against the customers you sell to, so it needs at least two. Set the
        brand on your deals and every customer becomes a row here - with the squares you have never filled showing
        through.
      </p>
      <Link
        to="/app/opportunities"
        className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
      >
        Open deals
      </Link>
    </section>
  );
}
