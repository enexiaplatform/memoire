import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { compareSafeBusinessDate, isBusinessDateInRange } from './safeDate.ts';

export type SignalDigestItem = {
  text: string;
  accountName: string;
  date: string;
};

export type SignalDigest = {
  buying: SignalDigestItem[];
  risks: SignalDigestItem[];
  timeline: SignalDigestItem[];
  competitors: SignalDigestItem[];
  total: number;
};

type CustomerSignalDigestInput = {
  activities: SalesActivityRecord[];
  /** Optional inclusive date range; when omitted, all captured signals count. */
  start?: string;
  end?: string;
};

/**
 * Customer-signal digest: the buying signals, risks, timeline signals, and
 * competitor mentions that capture already extracted per activity, rolled up
 * newest-first with case-insensitive dedupe. Pure read-model - nothing here
 * is inferred beyond what the seller captured. Shared by the Weekly Business
 * Review (period-scoped) and the Ask Memoire "what are customers telling me"
 * answer (workspace-wide).
 */
export function buildCustomerSignalDigest(input: CustomerSignalDigestInput): SignalDigest {
  const scoped = input.start && input.end
    ? input.activities.filter((activity) => isBusinessDateInRange(activity.activityDate, input.start, input.end))
    : input.activities;

  const collect = (getSignals: (activity: SalesActivityRecord) => string[] | undefined) => {
    const seen = new Set<string>();
    const items: SignalDigestItem[] = [];
    [...scoped]
      .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate))
      .forEach((activity) => {
        (getSignals(activity) || []).forEach((text) => {
          const cleaned = text.trim();
          const key = cleaned.toLowerCase();
          if (!cleaned || seen.has(key)) return;
          seen.add(key);
          items.push({
            text: cleaned,
            accountName: activity.accountName || activity.linkedAccountName || '',
            date: activity.activityDate,
          });
        });
      });
    return items.slice(0, 5);
  };

  const buying = collect((activity) => activity.buyingSignals);
  const risks = collect((activity) => activity.risks);
  const timeline = collect((activity) => activity.timelineSignals);
  const competitors = collect((activity) => activity.competitors);

  return {
    buying,
    risks,
    timeline,
    competitors,
    total: buying.length + risks.length + timeline.length + competitors.length,
  };
}
