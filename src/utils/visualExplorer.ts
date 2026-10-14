import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { canonicalBrandName } from './brandIdentity.ts';
import { timestampToLocalDateKey } from './safeDate.ts';
import { packSiblings, packEnclose } from 'd3-hierarchy';
import { accountKey } from './accountIdentity.ts';
import { resolveAccountName, buildAccountAliasIndex } from './accountAliases.ts';
import type { AccountMergeRecord } from '../services/accountMergeStore';

export type ExplorerRow = {
  id: string; name: string; account: string; brand: string; stage: string;
  currency: string; value: number | null; probability: number | null;
  month: string; status: string;
  accountKey: string; nextAction: string; nextActionDate: string; product: string;
};
export type ExplorerFilters = { currency: string; brand: string; stage: string; month: string; query: string };
export const EXPLORER_STAGES = ['Discovery', 'Qualification', 'Technical discussion', 'Demo', 'Proposal', 'Negotiation', 'Procurement', 'Won', 'Lost', 'On hold'];

/** Record-level estimates, never cash or realized revenue. Leads are a separate surface. */
export function explorerRows(opportunities: CrmLiteOpportunity[], merges: AccountMergeRecord[] = []): ExplorerRow[] {
  const brands = opportunities.map(row => row.brand || '');
  const canonical = new Map([...new Set(brands)].map(brand => [brand, canonicalBrandName(brand, brands)]));
  const aliases = buildAccountAliasIndex(merges);
  return opportunities.filter(row => row.stage !== 'Lead').map(row => ({
    id: row.id, name: row.opportunityName, account: row.accountName,
    brand: row.brand?.trim() ? canonical.get(row.brand)! : 'No brand set',
    stage: row.stage, status: row.status, currency: row.currency?.trim().toUpperCase() || 'Unspecified',
    value: typeof row.estimatedValue === 'number' && Number.isFinite(row.estimatedValue) && row.estimatedValue >= 0 ? row.estimatedValue : null,
    probability: typeof row.pipelineProbability === 'number' && Number.isFinite(row.pipelineProbability) && row.pipelineProbability >= 0 && row.pipelineProbability <= 100 ? row.pipelineProbability : null,
    month: timestampToLocalDateKey(row.createdAt).slice(0, 7),
    accountKey: accountKey(resolveAccountName(row.accountName, aliases)),
    nextAction: row.nextAction || '', nextActionDate: row.nextActionDate || '', product: row.productOrSolution || '',
  }));
}

export const EXPLORER_PALETTE = ['#943c55', '#c37a32', '#3a817e', '#59749b', '#7b8749', '#8c6a9e', '#a56345', '#457284'];
export type ExplorerPoint = { row: ExplorerRow; x: number; y: number; r: number };
export type ExplorerCluster = { brand: string; x: number; y: number; r: number; count: number };

/** A circle's area encodes its estimate. Tiny/zero/unknown marks have a disclosed floor. */
export function packExplorer(rows: ExplorerRow[], width: number, height: number) {
  const max = rows.reduce((value, row) => Math.max(value, row.value ?? 0), 1);
  const groups = new Map<string, Array<{ row: ExplorerRow; x: number; y: number; r: number }>>();
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const items = groups.get(row.brand) || [];
    items.push({ row, x: 0, y: 0, r: Math.max(3.5, 25 * Math.sqrt((row.value ?? 0) / max)) });
    groups.set(row.brand, items);
  }
  const circles = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([brand, points]) => {
    points.sort((a, b) => b.r - a.r || a.row.id.localeCompare(b.row.id));
    // Include 2 px separation in the collision geometry, then return actual data radii.
    const padded = points.map(point => ({ ...point, r: point.r + 2 }));
    packSiblings(padded);
    const enclosure = packEnclose(padded);
    return { brand, points: padded.map(point => ({ ...point, x: point.x - enclosure.x, y: point.y - enclosure.y, r: point.r - 2 })), x: 0, y: 0, r: enclosure.r + 28 };
  });
  if (!circles.length) return { points: [] as ExplorerPoint[], clusters: [] as ExplorerCluster[] };
  // Responsive small-multiple arrangement uses the whole viewport, with one
  // common scale across brands so leaf areas remain quantitatively comparable.
  const rowCount = Math.max(1, Math.ceil(Math.sqrt(circles.length * height / width)));
  const columns = Math.ceil(circles.length / rowCount), actualRows = Math.ceil(circles.length / columns);
  const cellWidth = width / columns, cellHeight = height / actualRows;
  const largest = Math.max(...circles.map(group => group.r));
  const scale = Math.min((cellWidth - Math.min(34, cellWidth * .2)) / (largest * 2), (cellHeight - Math.min(45, cellHeight * .3)) / (largest * 2));
  circles.forEach((group, i) => { group.x = (i % columns + .5) * cellWidth; group.y = (Math.floor(i / columns) + .5) * cellHeight; });
  return {
    points: circles.flatMap(group => group.points.map(point => ({ row: point.row, x: group.x + point.x * scale, y: group.y + point.y * scale, r: point.r * scale }))),
    clusters: circles.map(group => ({ brand: group.brand, x: group.x, y: group.y, r: (group.r - 18) * scale, count: group.points.length })),
  };
}

export function relatedExplorerRows(rows: ExplorerRow[], selected: ExplorerRow | undefined) {
  return selected?.accountKey ? rows.filter(row => row.id !== selected.id && row.accountKey === selected.accountKey) : [];
}

export function filterExplorerRows(rows: ExplorerRow[], filters: ExplorerFilters): ExplorerRow[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter(row => (!filters.currency || row.currency === filters.currency)
    && (!filters.brand || row.brand === filters.brand) && (!filters.stage || row.stage === filters.stage)
    && (!filters.month || (row.month || 'Unknown date') === filters.month)
    && (!query || `${row.name} ${row.account} ${row.brand}`.toLowerCase().includes(query)));
}

export function explorerGroups(rows: ExplorerRow[], field: 'brand' | 'stage' | 'month') {
  const groups = new Map<string, { key: string; count: number; value: number; known: number }>();
  for (const row of rows) {
    const key = row[field] || 'Unknown date';
    const group = groups.get(key) || { key, count: 0, value: 0, known: 0 };
    group.count++;
    if (row.value !== null) { group.value += row.value; group.known++; }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** CSV cells are quoted and formula-like user text is neutralized. */
export function explorerCsv(rows: ExplorerRow[]) {
  const cell = (value: string | number | null) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  return [['ID', 'Opportunity', 'Account', 'Brand', 'Stage', 'Currency', 'Estimated value', 'Recorded probability (%)', 'Created month'],
    ...rows.map(row => [row.id, row.name, row.account, row.brand, row.stage, row.currency, row.value, row.probability, row.month])]
    .map(row => row.map(cell).join(',')).join('\r\n');
}
