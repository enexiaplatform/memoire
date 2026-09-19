import { conditionReferenceIndex } from '../../domain/commercialKernel/conditionReferences.ts';
import { loadCommercialEvidence } from './evidenceStore.ts';
import { isCommercialCondition, type CommercialCondition } from '../../domain/commercialKernel/commercialCondition.ts';
import { readLocal, writeLocal, loadForWorkspace, syncRecordsForCurrentUser, type KernelCodec } from './kernelRepository.ts';
export const CONDITION_STORAGE_KEY = 'memoire.commercialConditions.v1';
export const CONDITION_UPDATED_EVENT = 'memoire:commercial-conditions-updated';
const fields = ['id', 'userId', 'accountId', 'opportunityId', 'statement', 'conditionCategory', 'intent', 'lifecycle', 'validFrom', 'createdAt', 'updatedAt', 'sourceType', 'sourceId', 'sourceUrl', 'sourceUpdatedAt', 'evidenceLinks'] as const;
const column = (field: string) => field.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
export const conditionCodec: KernelCodec<CommercialCondition> = {
  table: 'commercial_conditions', storageKey: CONDITION_STORAGE_KEY, updatedEvent: CONDITION_UPDATED_EVENT,
  orderColumn: 'updated_at', compare: (a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
  sanitize: value => {
    if (!isCommercialCondition(value)) return null;
    return { ...Object.fromEntries(fields.map(f => [f, value[f] ?? null])),
      ...(value.isSample ? { isSample: true } : {}) } as CommercialCondition;
  },
  toRow: (r, userId) => {
    if (r.userId !== userId) throw new Error('Condition belongs to another workspace.');
    return { ...Object.fromEntries(fields.map(f => [column(f), r[f] ?? null])), user_id: userId };
  },
  fromRow: row => conditionCodec.sanitize(Object.fromEntries(fields.map(f => [f, row[column(f)]]))),
};
export const loadCommercialConditions = () => readLocal(conditionCodec);
export async function loadCommercialConditionsForWorkspace(userId?: string | null, sampleDataActive = false) {
  const records = await loadForWorkspace(conditionCodec, userId, sampleDataActive);
  return records.filter(r => Boolean(r.isSample) === sampleDataActive && r.userId === (userId || null));
}
export function saveCommercialCondition(record: CommercialCondition) {
  writeLocal(conditionCodec, [record, ...loadCommercialConditions().filter(r => r.id !== record.id)]);
  syncRecordsForCurrentUser(conditionCodec, [record]);
}

/** Legacy browser fallback for non-UI callers; the Opportunity UI passes its loaded canonical anchors. */
export function localConditionReferenceIndex() {
  const read = (key: string) => {
    const rows: unknown = JSON.parse(window.localStorage.getItem(key) || '[]');
    if (!Array.isArray(rows)) throw new Error('Workspace references are unreadable.');
    return rows;
  };
  return conditionReferenceIndex(read('memoire.accounts.v1'), read('memoire.opportunities.v1'), loadCommercialEvidence());
}
