import type { OpportunityFormInput } from './opportunityStore.ts';
import type { PortfolioScope } from './portfolioStore.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';

export const BRAND_WRITE_JOURNAL_KEY = 'memoire.brandWriteJournal.v1';
export type BrandWriteCommand = {
  schemaVersion: 1; id: string; owner: string | null; sample: boolean;
  opportunityId: string; kind: 'create' | 'update'; input: OpportunityFormInput;
  fingerprint: string; state: 'prepared' | 'cloud-pending'; createdAt: string;
  isSample: boolean; source: 'demo' | 'user';
};
function check(scope: PortfolioScope) {
  if (!scope.sampleDataActive && getLocalWorkspaceOwner() !== scope.userId) throw new Error('Workspace changed before saving Brand work.');
}
function all(): BrandWriteCommand[] {
  const data: unknown = JSON.parse(localStorage.getItem(BRAND_WRITE_JOURNAL_KEY) || '[]');
  if (!Array.isArray(data) || data.some(row => !row || row.schemaVersion !== 1 || typeof row.id !== 'string' || typeof row.opportunityId !== 'string' || !['create','update'].includes(row.kind) || !row.input || typeof row.fingerprint !== 'string')) throw new Error('Pending Brand work is unreadable. Export a backup before repairing it.');
  return data;
}
export function pendingBrandWrites(scope: PortfolioScope) {
  check(scope); return all().filter(row => row.owner === scope.userId && row.sample === scope.sampleDataActive);
}
function persist(scope: PortfolioScope, commands: BrandWriteCommand[]) {
  check(scope); requireLocalWrite(writeLocalRecords(BRAND_WRITE_JOURNAL_KEY, commands));
}
export function beginBrandWrite(scope: PortfolioScope, input: OpportunityFormInput, opportunityId?: string) {
  check(scope);
  // Match the serialized command after a page reload, including optional fields.
  const durableInput: OpportunityFormInput = JSON.parse(JSON.stringify(input));
  const fingerprint = JSON.stringify(Object.keys(durableInput).sort().map(key => [key, Reflect.get(durableInput,key)]));
  const commands = all();
  const previous = commands.find(row => row.owner === scope.userId && row.sample === scope.sampleDataActive && row.fingerprint === fingerprint && row.kind === (opportunityId ? 'update' : 'create') && (!opportunityId || row.opportunityId === opportunityId));
  if (previous) return previous;
  // No second write for an existing record until its first command is resolved.
  if (opportunityId && commands.some(row => row.owner === scope.userId && row.sample === scope.sampleDataActive && row.opportunityId === opportunityId)) throw new Error('This deal has unfinished Brand work. Retry it in Products & Brands before making another change.');
  const command: BrandWriteCommand = {schemaVersion:1,id:crypto.randomUUID(),owner:scope.userId,sample:scope.sampleDataActive,
    opportunityId: opportunityId || crypto.randomUUID(),kind:opportunityId?'update':'create',input:durableInput,fingerprint,state:'prepared',createdAt:new Date().toISOString(),isSample:scope.sampleDataActive,source:scope.sampleDataActive?'demo':'user'};
  persist(scope,[...commands,command]); return command;
}
export function finishBrandWrite(scope: PortfolioScope, command: BrandWriteCommand, cloudPending: boolean) {
  const commands = all();
  persist(scope,cloudPending ? commands.map(row => row.id === command.id ? {...row,state:'cloud-pending' as const} : row) : commands.filter(row => row.id !== command.id));
}
