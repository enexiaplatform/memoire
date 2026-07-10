import type { SalesActivityRecord } from '../services/salesActivityStore.ts';

export type ActivityTrailChipKind = 'buying' | 'risk' | 'timeline' | 'competitor';

export type ActivityTrailChip = {
  kind: ActivityTrailChipKind;
  label: string;
  items: string[];
};

/**
 * Direction 7.1 gap: the ledger card shows what commercial state each
 * activity carried - the buying signals, risks, timeline signals, and
 * competitor mentions that capture already extracted. Pure read-model over
 * what the seller captured; an activity with no captured signals gets no
 * chips, never a guess.
 */
export function buildActivityStateTrail(activity: SalesActivityRecord): ActivityTrailChip[] {
  const chips: ActivityTrailChip[] = [];

  const push = (kind: ActivityTrailChipKind, singular: string, plural: string, raw?: string[]) => {
    const items = (raw || []).map((item) => item.trim()).filter(Boolean);
    if (items.length === 0) return;
    chips.push({
      kind,
      label: items.length === 1 ? `${singular}: ${truncateSignal(items[0])}` : `${items.length} ${plural}`,
      items,
    });
  };

  push('buying', 'Buying signal', 'buying signals', activity.buyingSignals);
  push('risk', 'Risk', 'risks', activity.risks);
  push('timeline', 'Timeline', 'timeline signals', activity.timelineSignals);
  push('competitor', 'Competitor', 'competitors', activity.competitors);

  return chips;
}

function truncateSignal(text: string, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
