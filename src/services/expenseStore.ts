import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
import { sanitizeBusinessDate, todayDateKey } from '../utils/safeDate.ts';
import { writeLocalRecords } from './localWriteGuard.ts';
import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  sendOwedCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
} from './cloudJsonCollectionStore.ts';

/**
 * Money-out half of the money-spine: local-first, and now backed by the
 * account.
 *
 * It was local-only until 2026-08-05, and the note here said so - cloud sync
 * "deliberately deferred so this increment ships without a schema migration".
 * What that deferral actually cost only shows up downstream: cash position, own
 * obligations, the P&L and the money half of the daily digest all read these
 * records, so a second device reported different cash on hand with nothing on
 * screen explaining it, and the server-built digest - which can only see cloud
 * rows - was computing every user's money picture against no expenses at all.
 *
 * Same JSON-collection pattern as quotes and supplier commitments: the browser
 * copy stays the read path, the account is the record, and a merged read pushes
 * up only what the cloud is missing.
 */
export const EXPENSE_STORAGE_KEY = 'memoire.expenses.v1';

export const expenseCategories = [
  'Cost of goods',
  'Salaries',
  'Rent & utilities',
  'Marketing',
  'Tools & software',
  'Logistics',
  'Tax & fees',
  'Other',
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export const expenseStatuses = ['Paid', 'Upcoming'] as const;
export type ExpenseStatus = (typeof expenseStatuses)[number];

export type ExpenseRecord = {
  id: string;
  expenseId: string;
  label: string;
  category: ExpenseCategory;
  amount: number | null;
  currency: string;
  status: ExpenseStatus;
  // For 'Paid': the date it left the account. For 'Upcoming': the day it is due
  // - an obligation that can itself go silent (see the own-obligations watch).
  expenseDate: string;
  dueDate: string;
  vendor: string;
  linkedAccountName: string;
  recurring: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type ExpenseInput = Omit<ExpenseRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const emptyExpenseInput: ExpenseInput = {
  expenseId: '',
  label: '',
  category: 'Other',
  amount: null,
  currency: 'VND',
  status: 'Paid',
  expenseDate: todayDateKey(),
  dueDate: '',
  vendor: '',
  linkedAccountName: '',
  recurring: false,
  notes: '',
  source: 'user',
  isSample: false,
};

export function loadExpenses(): ExpenseRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EXPENSE_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeExpense)
      .filter((expense): expense is ExpenseRecord => Boolean(expense) && expense!.__deleted !== true) as ExpenseRecord[];
  } catch {
    return [];
  }
}

/**
 * The account's expenses, merged with whatever this browser holds.
 *
 * A failed cloud read falls back to the browser copy rather than reporting an
 * empty book: "you have no expenses" and "I could not reach your expenses" look
 * identical on a P&L, and only one of them is safe to act on.
 */
export async function loadExpensesForUser(userId: string): Promise<ExpenseRecord[]> {
  if (!userId) return loadExpenses();
  try {
    const local = loadExpenses();
    const cloud = await loadCloudJsonCollection<ExpenseRecord>('expenses', userId);
    // Only adopt this browser's records into the account the first time, and
    // only if the browser has not already been claimed by someone else -
    // otherwise signing in on a shared machine would upload the last person's
    // spending.
    const recordsToMerge = claimLocalCollectionForUser('expenses', userId) ? local.filter(isUserRecord) : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeExpense)
      .filter((expense): expense is ExpenseRecord => Boolean(expense));
    persistExpenses(merged, false);
    sendOwedCloudJsonRecords('expenses', userId, merged, cloud);
    return merged;
  } catch {
    return loadExpenses();
  }
}

export function saveExpenses(expenses: ExpenseRecord[]) {
  if (typeof window === 'undefined') return false;
  try {
    persistExpenses(expenses);
    return true;
  } catch {
    return false;
  }
}

function persistExpenses(expenses: ExpenseRecord[], syncCloud = true) {
  const sanitized = expenses
    .map(sanitizeExpense)
    .filter((expense): expense is ExpenseRecord => Boolean(expense));
  writeLocalRecords(EXPENSE_STORAGE_KEY, sanitized);
  if (syncCloud) {
    syncCloudJsonCollectionForCurrentUser('expenses', sanitized);
    invalidateWorkspaceCollection('expenses');
  }
  return sanitized;
}

function isUserRecord(expense: ExpenseRecord) {
  return expense.source !== 'demo' && expense.isSample !== true;
}

export function createExpense(input: ExpenseInput) {
  const now = new Date().toISOString();
  const expense = sanitizeExpense({
    ...input,
    id: input.id || createExpenseRecordId(input.label),
    expenseId: input.expenseId || createReadableExpenseId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }) as ExpenseRecord;

  saveExpenses([expense, ...loadExpenses().filter((item) => item.id !== expense.id)]);
  return expense;
}

export function updateExpense(expense: ExpenseRecord, input: ExpenseInput) {
  const updated = sanitizeExpense({
    ...expense,
    ...input,
    id: expense.id,
    createdAt: expense.createdAt,
    updatedAt: new Date().toISOString(),
  }) as ExpenseRecord;

  saveExpenses(loadExpenses().map((item) => (item.id === expense.id ? updated : item)));
  return updated;
}

export function markExpensePaid(expense: ExpenseRecord) {
  const { id, createdAt, updatedAt, ...input } = expense;
  void id;
  void createdAt;
  void updatedAt;
  return updateExpense(expense, {
    ...input,
    status: 'Paid',
    expenseDate: sanitizeBusinessDate(expense.expenseDate) || todayDateKey(),
  });
}

export function deleteExpense(expenseId: string) {
  const saved = saveExpenses(loadExpenses().filter((item) => item.id !== expenseId));
  // A local filter alone is not a delete once the record is on the account: the
  // next merged read would find the cloud copy and put it straight back. The
  // tombstone is what makes the removal travel.
  deleteCloudJsonRecordForCurrentUser('expenses', expenseId);
  return saved;
}

function sanitizeExpense(raw: Partial<ExpenseRecord> | null): ExpenseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const label = String(raw.label || '').trim();
  if (!label) return null;
  const now = new Date().toISOString();
  const status: ExpenseStatus = raw.status === 'Upcoming' ? 'Upcoming' : 'Paid';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createExpenseRecordId(label),
    expenseId: String(raw.expenseId || createReadableExpenseId()).trim(),
    label,
    category: isExpenseCategory(raw.category) ? raw.category : 'Other',
    amount: normalizeNumber(raw.amount),
    currency: String(raw.currency || 'VND').trim().toUpperCase(),
    status,
    expenseDate: sanitizeBusinessDate(raw.expenseDate) || todayDateKey(),
    dueDate: sanitizeBusinessDate(raw.dueDate),
    vendor: String(raw.vendor || '').trim(),
    linkedAccountName: String(raw.linkedAccountName || '').trim(),
    recurring: raw.recurring === true,
    notes: String(raw.notes || '').trim(),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    source: raw.source === 'demo' ? 'demo' : raw.source === 'user' ? 'user' : undefined,
    isSample: raw.isSample === true,
    __deleted: raw.__deleted === true ? true : undefined,
  };
}

function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return expenseCategories.includes(value as ExpenseCategory);
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function createReadableExpenseId() {
  return `E-${todayDateKey().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createExpenseRecordId(seed: string) {
  return `expense-${slugify(seed)}-${Date.now()}`;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'expense';
}
