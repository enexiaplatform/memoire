import { FORECAST_QUARTERS, type ForecastQuarter } from '../../domain/commercialKernel/forecast.ts';
import { supabaseClient } from '../../lib/supabaseClient.ts';
import { reportWorkspaceSyncError } from '../workspaceSyncStatus.ts';
import { invalidateWorkspaceDataCache } from '../workspaceDataCache.ts';
import { writeLocalCollection } from '../localWriteGuard.ts';

export const TARGET_STORAGE_KEY = 'memoire.commercialTargets.v1';
export const TARGETS_UPDATED_EVENT = 'memoire:commercial-targets-updated';

export type CommercialTarget = {
  period: ForecastQuarter;
  fiscalYear: number;
  amount: number;
  currency: string;
  fiscalYearStartMonth: number;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function sanitize(value: unknown): CommercialTarget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const period = typeof raw.period === 'string' ? raw.period : '';
  if (!(FORECAST_QUARTERS as readonly string[]).includes(period)) return null;

  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const fiscalYear = Number(raw.fiscalYear);
  if (!Number.isFinite(fiscalYear)) return null;

  const startMonth = Number(raw.fiscalYearStartMonth);
  const now = new Date().toISOString();

  return {
    period: period as ForecastQuarter,
    fiscalYear: Math.round(fiscalYear),
    amount,
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : 'VND',
    fiscalYearStartMonth:
      Number.isFinite(startMonth) && startMonth >= 1 && startMonth <= 12 ? Math.round(startMonth) : 1,
    note: typeof raw.note === 'string' && raw.note ? raw.note : null,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now,
  };
}

const keyOf = (target: Pick<CommercialTarget, 'fiscalYear' | 'period'>) =>
  `${target.fiscalYear}:${target.period}`;

export function loadTargets(): CommercialTarget[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(TARGET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitize)
      .filter((target): target is CommercialTarget => Boolean(target))
      .sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
  } catch {
    return [];
  }
}

/**
 * Writes, and announces only a real change - the same rule the kernel
 * repository learned the hard way. Every load path ends in a write, and
 * treating an identical re-write as news made the app refetch itself forever.
 */
function persist(targets: CommercialTarget[]): CommercialTarget[] {
  const sorted = [...targets].sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
  if (!canUseStorage()) return sorted;

  const serialized = JSON.stringify(sorted);
  if (window.localStorage.getItem(TARGET_STORAGE_KEY) === serialized) return sorted;

  writeLocalCollection(TARGET_STORAGE_KEY, serialized);
  invalidateWorkspaceDataCache();
  window.dispatchEvent(new CustomEvent(TARGETS_UPDATED_EVENT, { detail: sorted }));
  return sorted;
}

export async function loadTargetsForWorkspace(
  userId?: string | null,
  sampleDataActive = false,
): Promise<CommercialTarget[]> {
  if (!userId || sampleDataActive || !supabaseClient) return loadTargets();

  try {
    const { data, error } = await supabaseClient
      .from('commercial_targets')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);

    const cloud = ((data || []) as Record<string, unknown>[])
      .map((row) => sanitize({
        period: row.period,
        fiscalYear: row.fiscal_year,
        amount: row.amount,
        currency: row.currency,
        fiscalYearStartMonth: row.fiscal_year_start_month,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
      .filter((target): target is CommercialTarget => Boolean(target));

    // Newest wins per period, so a target set on another device is respected.
    const merged = new Map<string, CommercialTarget>();
    for (const target of [...cloud, ...loadTargets()]) {
      const existing = merged.get(keyOf(target));
      if (!existing || target.updatedAt >= existing.updatedAt) merged.set(keyOf(target), target);
    }

    return persist(Array.from(merged.values()));
  } catch {
    reportWorkspaceSyncError();
    return loadTargets();
  }
}

export function saveTarget(target: CommercialTarget) {
  const clean = sanitize(target);
  if (!clean) return loadTargets();

  const next = persist([
    clean,
    ...loadTargets().filter((item) => keyOf(item) !== keyOf(clean)),
  ]);

  void syncTarget(clean);
  return next;
}

async function syncTarget(target: CommercialTarget) {
  if (!supabaseClient) return;
  try {
    const { data, error: authError } = await supabaseClient.auth.getUser();
    if (authError) throw new Error(authError.message);
    const userId = data.user?.id;
    if (!userId) return;

    const { error } = await supabaseClient.from('commercial_targets').upsert({
      user_id: userId,
      period: target.period,
      fiscal_year: target.fiscalYear,
      amount: target.amount,
      currency: target.currency,
      fiscal_year_start_month: target.fiscalYearStartMonth,
      note: target.note,
      created_at: target.createdAt,
      updated_at: target.updatedAt,
    }, { onConflict: 'user_id,fiscal_year,period' });

    if (error) throw new Error(error.message);
  } catch {
    reportWorkspaceSyncError();
  }
}
