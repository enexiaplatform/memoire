import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import type { ShareablePipelineDefenseBrief, ShareableDealRow, ShareableBriefChecklistItem } from './shareablePipelineDefenseBrief';

// A manager can OPEN a link, not just receive a pasted brief. The brief is
// encoded into the URL hash fragment - which browsers never send to any server -
// so the data stays client-side even though the viewing route is public. No
// backend row, no auth, no new serverless function (the api/ dir is at its cap).
export const SHARE_BRIEF_ROUTE = '/share/brief';
const SHARE_PARAM = 'b';
const SHARE_VERSION = 1;

export type CompactSharedBrief = {
  v: number;
  title: string;
  generatedAt: string;
  weekLabel: string;
  salesOwner: string;
  scope: string;
  managerSummary: string;
  summary: {
    totalDeals: number;
    defendableDeals: number;
    rescueDeals: number;
    downgradeDeals: number;
    totalPipelineValueLabel: string;
    topRiskThemes: Array<{ label: string; count: number }>;
  };
  dealRows: ShareableDealRow[];
  nextActions: Array<{ account: string; opportunity: string; title: string; priority: string }>;
  checklist: ShareableBriefChecklistItem[];
};

const MAX_DEAL_ROWS = 40;
const MAX_NEXT_ACTIONS = 12;

export function buildCompactSharedBrief(input: {
  brief?: PipelineDefenseBrief | null;
  shareable: ShareablePipelineDefenseBrief;
}): CompactSharedBrief {
  const { brief, shareable } = input;
  return {
    v: SHARE_VERSION,
    title: brief?.title || 'Pipeline Review Defense Brief',
    generatedAt: shareable.generatedAt,
    weekLabel: brief?.weekLabel || '',
    salesOwner: brief?.salesOwner || '',
    scope: brief?.scope || '',
    managerSummary: shareable.managerSummary,
    summary: {
      totalDeals: shareable.executiveSummary.totalDeals,
      defendableDeals: shareable.executiveSummary.defendableDeals,
      rescueDeals: shareable.executiveSummary.rescueDeals,
      downgradeDeals: shareable.executiveSummary.downgradeDeals,
      totalPipelineValueLabel: shareable.executiveSummary.totalPipelineValueLabel,
      topRiskThemes: shareable.executiveSummary.topRiskThemes.map((theme) => ({ label: theme.label, count: theme.count })),
    },
    dealRows: shareable.dealRows.slice(0, MAX_DEAL_ROWS),
    nextActions: shareable.nextDefenseActions.slice(0, MAX_NEXT_ACTIONS).map((action) => ({
      account: action.account,
      opportunity: action.opportunity,
      title: action.title,
      priority: action.priority,
    })),
    checklist: shareable.qualityChecklist,
  };
}

/** The hash fragment (`#b=...`) that carries the brief. */
export function encodeSharedBriefFragment(compact: CompactSharedBrief): string {
  const json = JSON.stringify(compact);
  return `#${SHARE_PARAM}=${base64UrlEncode(json)}`;
}

/** A full share URL, given the app origin. */
export function buildSharedBriefUrl(compact: CompactSharedBrief, origin: string): string {
  return `${origin.replace(/\/$/, '')}${SHARE_BRIEF_ROUTE}${encodeSharedBriefFragment(compact)}`;
}

/** Decodes a `#b=...` (or raw payload) fragment back into a brief, or null. */
export function decodeSharedBriefFragment(hash: string): CompactSharedBrief | null {
  try {
    const raw = extractPayload(hash);
    if (!raw) return null;
    const parsed = JSON.parse(base64UrlDecode(raw)) as CompactSharedBrief;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== SHARE_VERSION) return null;
    if (!Array.isArray(parsed.dealRows) || typeof parsed.summary !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractPayload(hash: string) {
  const cleaned = hash.replace(/^#/, '');
  if (!cleaned) return '';
  const params = new URLSearchParams(cleaned);
  return params.get(SHARE_PARAM) || (cleaned.includes('=') ? '' : cleaned);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}
