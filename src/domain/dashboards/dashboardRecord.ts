import { parseDashboardDefinition, type DashboardDefinition } from './dashboardDefinition.ts';
export type DashboardState = { definition: DashboardDefinition; archived: boolean };
export type SavedDashboard = DashboardState & {
  id: string; schemaVersion: 1; version: number; createdAt: string; updatedAt: string; source: 'user' | 'demo'; isSample: boolean;
  history: { version: number; changedAt: string; state: DashboardState }[];
};
function state(value: unknown): DashboardState {
  if (!value || typeof value !== 'object' || typeof (value as DashboardState).archived !== 'boolean') throw new Error('Invalid saved dashboard state.');
  return { definition: parseDashboardDefinition((value as DashboardState).definition), archived: (value as DashboardState).archived };
}
export function parseSavedDashboard(value: unknown): SavedDashboard {
  const parsed = state(value), raw = value as SavedDashboard;
  if (raw.schemaVersion !== 1 || !Number.isInteger(raw.version) || raw.version < 1) throw new Error('Unsupported saved dashboard version.');
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 200) throw new Error('Invalid dashboard identity.');
  const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (!date(raw.createdAt) || !date(raw.updatedAt) || Date.parse(raw.updatedAt) < Date.parse(raw.createdAt)) throw new Error('Invalid saved dashboard timestamps.');
  if (!['user', 'demo'].includes(raw.source) || typeof raw.isSample !== 'boolean' || (raw.source === 'demo') !== raw.isSample) throw new Error('Invalid dashboard data mode.');
  if (!Array.isArray(raw.history) || raw.history.length !== raw.version - 1) throw new Error('Incomplete dashboard history.');
  let previous = raw.createdAt;
  const history = raw.history.map((revision, index) => {
    if (!revision || revision.version !== index + 1 || !date(revision.changedAt) || Date.parse(revision.changedAt) < Date.parse(previous)
      || Date.parse(revision.changedAt) > Date.parse(raw.updatedAt)) throw new Error('Invalid dashboard history.');
    previous = revision.changedAt;
    return { version: index + 1, changedAt: revision.changedAt, state: state(revision.state) };
  });
  return { ...parsed, id: raw.id, schemaVersion: 1, version: raw.version, createdAt: raw.createdAt, updatedAt: raw.updatedAt, source: raw.source, isSample: raw.isSample, history };
}
export function changeSavedDashboard(records: SavedDashboard[], input: { id: string; state: DashboardState; expectedVersion: number; sample: boolean; at: string }): SavedDashboard[] {
  const old = records.find(row => row.id === input.id);
  if ((old?.version || 0) !== input.expectedVersion) throw new Error('This dashboard changed. Reload before saving.');
  if (old && (old.isSample !== input.sample || Date.parse(input.at) < Date.parse(old.updatedAt))) throw new Error('Dashboard scope or timestamp changed.');
  const history = old ? [...old.history, { version: old.version, changedAt: old.updatedAt, state: state(old) }] : [];
  const next = parseSavedDashboard({ ...input.state, id: input.id, schemaVersion: 1, version: input.expectedVersion + 1,
    createdAt: old?.createdAt || input.at, updatedAt: input.at, source: input.sample ? 'demo' : 'user', isSample: input.sample, history });
  return [...records.filter(row => row.id !== input.id), next];
}
export function mergeSavedDashboard(left: SavedDashboard, right: SavedDashboard): SavedDashboard {
  const a = parseSavedDashboard(left), b = parseSavedDashboard(right), newer = a.version >= b.version ? a : b, older = newer === a ? b : a;
  const common = newer.version === older.version ? state(newer) : newer.history[older.version - 1]?.state;
  const commonAt = newer.version === older.version ? newer.updatedAt : newer.history[older.version - 1]?.changedAt;
  if (newer.id !== older.id || newer.isSample !== older.isSample || newer.createdAt !== older.createdAt || commonAt !== older.updatedAt
    || JSON.stringify(common) !== JSON.stringify(state(older)) || JSON.stringify(newer.history.slice(0, older.version - 1)) !== JSON.stringify(older.history)) throw new Error('Dashboard sync conflict: two devices edited this definition differently. Export a workspace backup before reconciling.');
  return newer;
}
export function mergeSavedDashboards(local: SavedDashboard[], cloud: SavedDashboard[]): SavedDashboard[] {
  const records = new Map<string, SavedDashboard>();
  for (const item of [...cloud, ...local]) {
    const row = parseSavedDashboard(item), previous = records.get(row.id);
    records.set(row.id, previous ? mergeSavedDashboard(row, previous) : row);
  }
  return [...records.values()];
}
