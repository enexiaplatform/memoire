import { sanitizeBusinessDate } from '../../utils/safeDate.ts';
import type { AutomationSettings } from '../../../shared/automation.js';
import { prepareWorkspaceAutomation } from './workspacePreparation.ts';

type Row = Record<string, any>;
export type AutomationSnapshot = {
  [key: string]: Row[];
  opportunities: Row[]; quotes: Row[]; commitments: Row[];
  plans: Row[]; activities: Row[]; expenses: Row[];
};
export type AutomationCandidate = {
  key: string; rule: 'quote-followup' | 'commitment-reminder' | 'collection-reminder' | 'supplier-reminder' | 'lead-followup' | 'order-reminder' | 'opportunity-reminder'; sourceId: string;
  dueDate: string; date: string; label: string; accountName: string;
  opportunityId: string; reason: string;
  subjectKey?: string;
};
const real = (row: Row) => row.isSample !== true && row.is_sample !== true
  && row.source !== 'demo' && row.source_type !== 'demo' && row.__deleted !== true;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
function payloads(rows: Row[]) {
  return rows.map(row => ({ ...row.payload, id: row.id })).filter(real);
}

/** Pure preparation. Only the separately authorized server executor can write. */
export function prepareAutomationWork(snapshot: AutomationSnapshot, settings: AutomationSettings, today: string,
  isPersistedKey: (key: string) => boolean = () => false, capturedAt?: string) {
  if (!sanitizeBusinessDate(today)) throw new Error('invalid_business_date');
  for (const key of ['opportunities', 'quotes', 'commitments', 'plans', 'activities', 'expenses'] as const) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].length > 5000) throw new Error('snapshot_incomplete');
  }
  const opportunities = snapshot.opportunities.filter(real);
  const opportunitiesById = new Map(opportunities.map(row => [row.id, row]));
  const quotes = payloads(snapshot.quotes), plans = payloads(snapshot.plans);
  const commitments = snapshot.commitments.filter(real);
  const commitmentsById = new Map(commitments.map(row => [row.id, row]));
  const prepared = prepareWorkspaceAutomation(snapshot, settings, today, capturedAt);
  const eligible: AutomationCandidate[] = [...prepared.candidates];
  const opportunityOpen = (id: string) => {
    if (!id) return true;
    const row = opportunitiesById.get(id);
    return !!row && row.status === 'Active' && !['Won', 'Lost', 'Lead'].includes(row.stage);
  };
  if (settings.quoteFollowup) for (const quote of quotes) {
    const date = sanitizeBusinessDate(quote.quoteDate), opportunityId = text(quote.opportunityId);
    if (!date || !['Sent', 'Revised'].includes(quote.status) || quote.poStatus === 'Received'
      || !opportunityOpen(opportunityId)) continue;
    const dueDate = shift(date, settings.quoteDays);
    if (dueDate > today) continue;
    eligible.push({ key: `quote-followup:${quote.id}:${date}`, rule: 'quote-followup', sourceId: quote.id,
      dueDate, date: today, label: `Follow up quote: ${text(quote.title) || text(quote.quoteId) || quote.id}`.slice(0, 450),
      accountName: text(quote.accountName), opportunityId,
      reason: `Sent/revised quote dated ${date}; ${settings.quoteDays} days have elapsed. Based on recorded status, not inbox monitoring.` });
  }
  if (settings.commitmentReminder) for (const commitment of commitments) {
    const dueDate = sanitizeBusinessDate(commitment.current_due_date), opportunityId = text(commitment.opportunity_id);
    if (commitment.status !== 'open' || !dueDate || dueDate > shift(today, settings.commitmentLeadDays)
      || !text(commitment.commitment_text) || !opportunityOpen(opportunityId)) continue;
    // A Plan-derived commitment already has its own task; never manufacture a reminder loop.
    if (commitment.id.startsWith('plan:') || commitment.source_type === 'plan' || commitment.source_type === 'plan_item') continue;
    eligible.push({ key: `commitment-reminder:${commitment.id}:${dueDate}`, rule: 'commitment-reminder', sourceId: commitment.id,
      dueDate, date: today,
      label: `${commitment.commitment_party === 'self' ? 'Keep commitment' : 'Check commitment'}: ${text(commitment.commitment_text)}`.slice(0, 450),
      accountName: text(commitment.account_name), opportunityId,
      reason: `${commitment.commitment_party} commitment due ${dueDate}; reminder window ${settings.commitmentLeadDays} day(s).` });
  }
  eligible.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
  const keys = new Set(eligible.map(item => item.key));
  const ruleEnabled = { 'quote-followup': settings.quoteFollowup, 'commitment-reminder': settings.commitmentReminder,
    'collection-reminder': settings.collectionReminder, 'supplier-reminder': settings.supplierReminder,
    'lead-followup': settings.leadFollowup, 'order-reminder': settings.orderReminder, 'opportunity-reminder': settings.opportunityReminder };
  const retireIds = plans.filter(plan => plan.automation && !keys.has(plan.automation.key)
    && !prepared.retirementProtectedSources.includes(`${plan.automation.rule}:${plan.automation.sourceId}`)
    && ruleEnabled[plan.automation.rule as keyof typeof ruleEnabled]
    && !plan.done && !plan.dismissed && plan.createdAt === plan.updatedAt).map(plan => plan.id);
  let alreadyHandled = 0;
  const suggestionKeys = new Set(plans.map(plan => plan.suggestionKey));
  const automationKeys = new Set(plans.map(plan => plan.automation?.key));
  const planIds = new Set(plans.map(plan => plan.id));
  const derivedKeys = new Set(plans.flatMap(plan => [plan.derivedKey, ...(plan.linkedDerivedKeys || [])]));
  const editedSources = new Set(plans.filter(plan => plan.automation && !plan.done && !plan.dismissed
    && plan.createdAt !== plan.updatedAt).map(plan => plan.automation.subjectKey || `${plan.automation.rule}:${plan.automation.sourceId}`));
  const manualWork = new Set(plans.filter(plan => plan.linkedOpportunityId && !plan.done && !plan.dismissed)
    .map(plan => `${plan.linkedOpportunityId}:${text(plan.label).toLowerCase()}`));
  const candidates = eligible.filter(candidate => {
    const opportunity = opportunitiesById.get(candidate.opportunityId);
    const derivedKey = opportunity && `deal:${opportunity.id}:${opportunity.next_action_date}`;
    const usesDealAction = !['collection-reminder', 'supplier-reminder', 'order-reminder'].includes(candidate.rule);
    const hasDerivedPlan = usesDealAction && opportunity?.status === 'Active'
      && !!sanitizeBusinessDate(opportunity.next_action_date) && !!text(opportunity.next_action);
    const hasPlan = isPersistedKey(candidate.key) || suggestionKeys.has(`automation:${candidate.key}`)
      || automationKeys.has(candidate.key)
      || candidate.rule === 'commitment-reminder' && planIds.has(commitmentsById.get(candidate.sourceId)?.source_id)
      || editedSources.has(candidate.subjectKey || `${candidate.rule}:${candidate.sourceId}`)
      || manualWork.has(`${candidate.opportunityId}:${candidate.label.toLowerCase()}`)
      || usesDealAction && derivedKey && derivedKeys.has(derivedKey);
    if (hasPlan || hasDerivedPlan) { alreadyHandled++; return false; }
    return true;
  });
  return { candidates: candidates.slice(0, settings.maxPlanItems), retireIds: retireIds.slice(0, 100), outputs: prepared.outputs, warnings:prepared.warnings,
    counts: { eligible: eligible.length, alreadyHandled, deferred: Math.max(0, candidates.length - settings.maxPlanItems) },
    // Reuse the existing server digest; these rows retain the database's authoritative IDs.
    digestInput: { opportunities, activities: snapshot.activities.filter(real), quotes,
      expenses: payloads(snapshot.expenses), errors: [] },
    commitmentCounts: { due: commitments.filter(row => row.status === 'open' && sanitizeBusinessDate(row.current_due_date)
      && row.current_due_date <= today).length },
  };
}
