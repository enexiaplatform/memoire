import { isOutcomeRequirement, type OutcomeRequirement } from '../../domain/commercialKernel/outcomeRequirement.ts';
import { readLocal, writeLocal, loadForWorkspace, syncRecordsForCurrentUser, type KernelCodec } from './kernelRepository.ts';
export const REQUIREMENT_STORAGE_KEY = 'memoire.outcomeRequirements.v1';
export const REQUIREMENT_UPDATED_EVENT = 'memoire:outcome-requirements-updated';
const fields = ['id','userId','accountId','opportunityId','expectedOutcome','question','conditionId','role','lifecycle','createdAt','updatedAt','sourceType','sourceId','sourceUrl','sourceUpdatedAt'] as const;
const column = (field: string) => field.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
export const requirementCodec: KernelCodec<OutcomeRequirement> = {
  table: 'commercial_outcome_requirements', storageKey: REQUIREMENT_STORAGE_KEY, updatedEvent: REQUIREMENT_UPDATED_EVENT,
  orderColumn: 'updated_at', compare: (a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
  sanitize: value => isOutcomeRequirement(value) ? { ...Object.fromEntries(fields.map(f => [f, value[f] ?? null])), ...(value.isSample ? { isSample: true } : {}) } as OutcomeRequirement : null,
  toRow: (r,userId) => {
    if (r.userId !== userId) throw new Error('Requirement belongs to another workspace.');
    return { ...Object.fromEntries(fields.map(f => [column(f), r[f] ?? null])), user_id: userId };
  },
  fromRow: row => requirementCodec.sanitize(Object.fromEntries(fields.map(f => [f,row[column(f)]]))),
};
export const loadOutcomeRequirements = () => readLocal(requirementCodec);
export async function loadOutcomeRequirementsForWorkspace(userId?: string | null, sampleDataActive = false) {
  const records = await loadForWorkspace(requirementCodec,userId,sampleDataActive);
  return records.filter(r => r.userId === (userId || null) && Boolean(r.isSample) === sampleDataActive);
}
export function saveOutcomeRequirement(record: OutcomeRequirement) {
  writeLocal(requirementCodec,[record,...loadOutcomeRequirements().filter(r => r.id !== record.id)]);
  syncRecordsForCurrentUser(requirementCodec,[record]);
}
