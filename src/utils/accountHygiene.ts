import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { QuoteRecord } from '../services/quoteStore';
import { isBusinessDateOverdue, isValidBusinessDate } from './safeDate.ts';

export const ACCOUNT_HYGIENE_PREFERENCES_KEY = 'memoire.accountHygiene.v1';
export const accountEngagementStatuses = ['Active', 'Strategic', 'Needs follow-up', 'Dormant', 'Imported only', 'Archived'] as const;
export type AccountEngagementStatus = (typeof accountEngagementStatuses)[number];

export type AccountHygienePreference = {
  accountId: string;
  archived: boolean;
  strategic: boolean;
  updatedAt: string;
};

export type AccountEngagementClassification = {
  status: AccountEngagementStatus;
  hasMeaningfulSignal: boolean;
  hasFollowUpSignal: boolean;
  followUpDue: boolean;
  reasons: string[];
};

export function classifyAccountEngagement(input: {
  account: AccountMemoryRecord;
  opportunities?: CrmLiteOpportunity[];
  activities?: SalesActivityRecord[];
  objections?: ObjectionRecord[];
  quotes?: QuoteRecord[];
  preference?: AccountHygienePreference;
  today?: string;
}): AccountEngagementClassification {
  const account = input.account;
  const opportunities = matching(input.opportunities || [], account);
  const activities = matching(input.activities || [], account);
  const objections = matching(input.objections || [], account);
  const quotes = matching(input.quotes || [], account);
  const openOpportunities = opportunities.filter((item) => item.status === 'Active');
  const openObjections = objections.filter((item) => item.status === 'Open');
  const actionQuotes = quotes.filter((item) => ['Sent', 'Revised', 'Accepted'].includes(item.status));
  const recentActivities = activities.filter((item) => isRecent(item.activityDate, input.today));
  const explicitAccountAction = isValidBusinessDate(account.nextFollowUp);
  const opportunityAction = openOpportunities.some((item) => Boolean(item.nextAction.trim() || isValidBusinessDate(item.nextActionDate)));
  const activityAction = activities.some((item) => Boolean(item.nextAction.trim()));
  const quoteAction = actionQuotes.length > 0;
  const hasFollowUpSignal = explicitAccountAction || opportunityAction || activityAction || quoteAction || openObjections.length > 0;
  const followUpDue = Boolean(
    explicitAccountAction
    || openObjections.length
    || actionQuotes.length > 0
    || activities.some((item) => item.nextAction.trim() && (!item.dueDate || isBusinessDateOverdue(item.dueDate, input.today)))
    || openOpportunities.some((item) => item.nextAction.trim() && (!item.nextActionDate || isBusinessDateOverdue(item.nextActionDate, input.today))),
  );
  const strategic = Boolean(
    input.preference?.strategic
    || account.kaFlag
    || account.fy26TargetSgd
    || account.fy27TargetSgd
    || account.accountPotential === 'High'
    || /strategic|key account|tier 1/i.test([account.segment, account.priority, account.tags.join(' ')].join(' ')),
  );
  const hasHistoricalSignal = opportunities.length > 0 || activities.length > 0 || objections.length > 0 || quotes.length > 0;
  const importedRecord = Boolean(account.sourceSystem?.trim() || account.externalSourceKey?.trim() || account.accountMasterStage?.trim());
  const active = openOpportunities.length > 0 || recentActivities.length > 0 || openObjections.length > 0 || actionQuotes.length > 0 || explicitAccountAction;
  const reasons = [
    openOpportunities.length ? `${openOpportunities.length} open opportunity` : '',
    recentActivities.length ? 'Recent activity' : '',
    openObjections.length ? `${openObjections.length} open objection` : '',
    actionQuotes.length ? 'Commercial follow-up' : '',
    explicitAccountAction ? 'Explicit account next action' : '',
    strategic ? 'Strategic signal' : '',
  ].filter(Boolean);

  if (input.preference?.archived) return { status: 'Archived', hasMeaningfulSignal: false, hasFollowUpSignal: false, followUpDue: false, reasons: ['Manually archived'] };
  if (hasFollowUpSignal) return { status: 'Needs follow-up', hasMeaningfulSignal: true, hasFollowUpSignal: true, followUpDue, reasons };
  if (active) return { status: 'Active', hasMeaningfulSignal: true, hasFollowUpSignal: false, followUpDue: false, reasons };
  if (strategic) return { status: 'Strategic', hasMeaningfulSignal: true, hasFollowUpSignal: false, followUpDue: false, reasons };
  if (hasHistoricalSignal) return { status: 'Dormant', hasMeaningfulSignal: true, hasFollowUpSignal: false, followUpDue: false, reasons: ['Historical sales signal, no current action'] };
  if (importedRecord) return { status: 'Imported only', hasMeaningfulSignal: false, hasFollowUpSignal: false, followUpDue: false, reasons: ['No sales memory yet'] };
  return { status: 'Active', hasMeaningfulSignal: true, hasFollowUpSignal: false, followUpDue: false, reasons: ['Manually created account awaiting first sales memory'] };
}

export function isDefaultAccountStatus(status: AccountEngagementStatus) {
  return status === 'Active' || status === 'Strategic' || status === 'Needs follow-up';
}

export function loadAccountHygienePreferences(userId?: string): AccountHygienePreference[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(preferenceKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.accountId) : [];
  } catch {
    return [];
  }
}

export function setAccountArchived(accountId: string, archived: boolean, userId?: string) {
  return savePreference(accountId, { archived }, userId);
}

export function setAccountStrategic(accountId: string, strategic: boolean, userId?: string) {
  return savePreference(accountId, { strategic }, userId);
}

function savePreference(accountId: string, patch: Partial<Pick<AccountHygienePreference, 'archived' | 'strategic'>>, userId?: string) {
  const current = loadAccountHygienePreferences(userId);
  const existing = current.find((item) => item.accountId === accountId);
  const nextPreference: AccountHygienePreference = {
    accountId,
    archived: patch.archived ?? existing?.archived ?? false,
    strategic: patch.strategic ?? existing?.strategic ?? false,
    updatedAt: new Date().toISOString(),
  };
  const next = [nextPreference, ...current.filter((item) => item.accountId !== accountId)];
  if (typeof localStorage !== 'undefined') localStorage.setItem(preferenceKey(userId), JSON.stringify(next));
  return next;
}

function matching<T extends { accountName: string; accountId?: string }>(items: T[], account: AccountMemoryRecord) {
  return items.filter((item) => item.accountId === account.id || normalize(item.accountName) === normalize(account.accountName));
}

function isRecent(value: string, today = new Date().toISOString().slice(0, 10)) {
  if (!isValidBusinessDate(value) || !isValidBusinessDate(today)) return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${value}T00:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= 30;
}

function preferenceKey(userId?: string) {
  return `${ACCOUNT_HYGIENE_PREFERENCES_KEY}:${userId || 'guest'}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
