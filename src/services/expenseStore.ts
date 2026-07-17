import { invalidateWorkspaceDataCache } from './workspaceDataCache.ts';
import { sanitizeBusinessDate, todayDateKey } from '../utils/safeDate.ts';

// Money-out half of the money-spine. Local-first by design: it persists to
// localStorage under the `memoire.` prefix so the existing export and
// clear-local flows pick it up automatically. Cloud sync mirrors the quote
// store's JSON-collection pattern and is a documented follow-up (needs the
// `expenses` Supabase table + union entry) - deliberately deferred so this
// increment ships without a schema migration.
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

// The workspace loader calls stores by (userId?) signature. Expenses are
// local-first, so the cloud id is accepted but unused for now.
export async function loadExpensesForUser(_userId: string) {
  void _userId;
  return loadExpenses();
}

export function saveExpenses(expenses: ExpenseRecord[]) {
  if (typeof window === 'undefined') return false;
  try {
    const sanitized = expenses
      .map(sanitizeExpense)
      .filter((expense): expense is ExpenseRecord => Boolean(expense));
    window.localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(sanitized));
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
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
  return saveExpenses(loadExpenses().filter((item) => item.id !== expenseId));
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
