import { parseReportDefinition, type ReportDefinition } from './reportDefinition.ts';
export type ReportState = { definition: ReportDefinition; archived: boolean };
export type SavedReport = ReportState & {
  id: string; schemaVersion: 1; version: number; createdAt: string; updatedAt: string; source: 'user' | 'demo'; isSample: boolean;
  history: { version: number; changedAt: string; state: ReportState }[];
};
function state(value: unknown): ReportState {
  if (!value || typeof value !== 'object' || typeof (value as ReportState).archived !== 'boolean') throw new Error('Invalid saved report state.');
  return { definition: parseReportDefinition((value as ReportState).definition), archived: (value as ReportState).archived };
}
export function parseSavedReport(value: unknown): SavedReport {
  const parsed = state(value), raw = value as SavedReport;
  if (raw.schemaVersion !== 1 || !Number.isInteger(raw.version) || raw.version < 1) throw new Error('Unsupported saved report version.');
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 200) throw new Error('Invalid report identity.');
  const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (!date(raw.createdAt) || !date(raw.updatedAt) || Date.parse(raw.updatedAt) < Date.parse(raw.createdAt)) throw new Error('Invalid saved report timestamps.');
  if (!['user', 'demo'].includes(raw.source) || typeof raw.isSample !== 'boolean' || (raw.source === 'demo') !== raw.isSample) throw new Error('Invalid report data mode.');
  if (!Array.isArray(raw.history) || raw.history.length !== raw.version - 1) throw new Error('Incomplete report history.');
  let previous = raw.createdAt;
  const history = raw.history.map((revision, index) => {
    if (!revision || revision.version !== index + 1 || !date(revision.changedAt) || Date.parse(revision.changedAt) < Date.parse(previous)
      || Date.parse(revision.changedAt) > Date.parse(raw.updatedAt)) throw new Error('Invalid report history.');
    previous = revision.changedAt;
    return { version: index + 1, changedAt: revision.changedAt, state: state(revision.state) };
  });
  return { ...parsed, id: raw.id, schemaVersion: 1, version: raw.version, createdAt: raw.createdAt, updatedAt: raw.updatedAt, source: raw.source, isSample: raw.isSample, history };
}
export function changeSavedReport(records: SavedReport[], input: { id: string; state: ReportState; expectedVersion: number; sample: boolean; at: string }): SavedReport[] {
  const old = records.find(row => row.id === input.id);
  if ((old?.version || 0) !== input.expectedVersion) throw new Error('This report changed. Reload before saving.');
  if (old && (old.isSample !== input.sample || Date.parse(input.at) < Date.parse(old.updatedAt))) throw new Error('Report scope or timestamp changed.');
  const history = old ? [...old.history, { version: old.version, changedAt: old.updatedAt, state: state(old) }] : [];
  const next = parseSavedReport({ ...input.state, id: input.id, schemaVersion: 1, version: input.expectedVersion + 1,
    createdAt: old?.createdAt || input.at, updatedAt: input.at, source: input.sample ? 'demo' : 'user', isSample: input.sample, history });
  return [...records.filter(row => row.id !== input.id), next];
}
export function mergeSavedReport(left: SavedReport, right: SavedReport): SavedReport {
  const a = parseSavedReport(left), b = parseSavedReport(right), newer = a.version >= b.version ? a : b, older = newer === a ? b : a;
  const common = newer.version === older.version ? state(newer) : newer.history[older.version - 1]?.state;
  const commonAt = newer.version === older.version ? newer.updatedAt : newer.history[older.version - 1]?.changedAt;
  if (newer.id !== older.id || newer.isSample !== older.isSample || newer.createdAt !== older.createdAt || commonAt !== older.updatedAt
    || JSON.stringify(common) !== JSON.stringify(state(older)) || JSON.stringify(newer.history.slice(0, older.version - 1)) !== JSON.stringify(older.history)) throw new Error('Report sync conflict: two devices edited this definition differently. Export a workspace backup before reconciling.');
  return newer;
}
export function mergeSavedReports(local: SavedReport[], cloud: SavedReport[]): SavedReport[] {
  const records = new Map<string, SavedReport>();
  for (const item of [...cloud, ...local]) {
    const row = parseSavedReport(item), previous = records.get(row.id);
    records.set(row.id, previous ? mergeSavedReport(row, previous) : row);
  }
  return [...records.values()];
}
