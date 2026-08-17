import { useMemo } from 'react';
import { ThreadQuickLook } from './ThreadQuickLook';
import { useCommercialThreads } from './useCommercialThreads';
import type { ResolvedThread } from '../../domain/commercialKernel/deriveThreads';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';

export type ThreadFilter = {
  /** Show only threads for this customer. */
  accountName?: string;
  /** Show only threads whose money has left the starting line. */
  moneyInMotionOnly?: boolean;
  /** Show closed threads too. Off by default so archived work leaves the view. */
  includeClosed?: boolean;
};

/**
 * The Commercial Thread list, filtered for whichever surface is asking.
 *
 * One component and one derivation, so Account, Money and Review cannot end up
 * telling three different stories about the same customer - which is exactly
 * what happened when each page computed its own "where does this stand".
 */
export function ThreadsSection({
  title = 'Commercial threads',
  description,
  filter = {},
  limit = 6,
  emptyMessage = 'No commercial threads yet. Capture a customer interaction and one appears on its own.',
}: {
  title?: string;
  description?: string;
  filter?: ThreadFilter;
  limit?: number;
  emptyMessage?: string;
}) {
  const { threads, loading } = useCommercialThreads();

  const visible = useMemo(() => {
    let result: ResolvedThread[] = threads;

    if (!filter.includeClosed) {
      result = result.filter((thread) => thread.status === 'active' || thread.status === 'waiting');
    }
    if (filter.accountName) {
      // Canonical key: a plain lowercase filtered "CÔNG TY X" to nothing when
      // the thread was filed without the accents.
      const key = normalizeEntityName(filter.accountName);
      result = result.filter((thread) => normalizeEntityName(thread.accountName) === key);
    }
    if (filter.moneyInMotionOnly) {
      result = result.filter(
        (thread) => thread.currentMoneyState !== 'none' && thread.currentMoneyState !== 'paid',
      );
    }

    // Quietest first: a thread that has been moving does not need watching.
    return [...result]
      .sort((left, right) => (right.daysSinceActivity ?? 0) - (left.daysSinceActivity ?? 0))
      .slice(0, limit);
  }, [filter.accountName, filter.includeClosed, filter.moneyInMotionOnly, limit, threads]);

  return (
    <section aria-label={title}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>

      {loading && visible.length === 0 ? (
        <p className="text-xs text-gray-400">Reading your commercial threads…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-500">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((thread) => (
            <ThreadQuickLook key={thread.id} thread={thread} compact />
          ))}
        </div>
      )}
    </section>
  );
}
