import { supabaseClient } from '../lib/supabaseClient.ts';
import {
  BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  getReportingCurrency,
  setReportingCurrency,
  type SupportedCurrency,
} from '../utils/money.ts';
import { getOpeningCashBalance, setOpeningCashBalance } from '../utils/cashPosition.ts';

/**
 * The two settings that describe how a person reads their own numbers, kept on
 * the account rather than in one browser.
 *
 * Both used to live only in localStorage, and both failed the same way: a
 * seller picked SGD in Settings, the select showed SGD, and the next load
 * showed VND again. Three separate causes produce that one symptom, and a
 * workspace hits all three eventually -
 *
 *   1. localStorage is per-origin-per-browser. Sign in on a phone, on the
 *      installed PWA, or after clearing site data, and the answer is gone.
 *   2. A workspace of a few hundred records is measured at ~3MB of JSON against
 *      a ~5MB ceiling. Past it every `setItem` throws QuotaExceededError, and
 *      the old writer caught that and returned as if it had saved.
 *   3. Private-mode Safari refuses the first write outright.
 *
 * So the account row is the record and the browser copy is a cache in front of
 * it. Reads stay synchronous against the cache - `getReportingCurrency()` is
 * called once per money value on screen and cannot become a promise - and the
 * cache is filled from the account at sign-in, before the first page paints its
 * numbers.
 *
 * Every function here reports whether the durable write actually happened. A
 * preference that says "Saved" without saving is the bug this file replaces.
 */

const TABLE_NAME = 'user_profiles';

export type PreferenceSaveResult = {
  /** The account row now holds this value. */
  savedToAccount: boolean;
  /** This browser's cache now holds it, so the current session reads it. */
  savedLocally: boolean;
  /** Operator-facing sentence. Empty when everything landed. */
  problem: string;
};

/** Whether the durable copy landed, and if not, whether there was one to land in. */
type AccountWrite = 'saved' | 'no-account' | 'failed';

export type WorkspacePreferences = {
  reportingCurrency: SupportedCurrency;
  openingCashBalance: number | null;
};

function canUseAccountStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

function isSupported(value: unknown): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(String(value || '').trim().toUpperCase());
}

/**
 * Fills the browser cache from the account. Call once per session, as early as
 * the user id is known and before money is rendered.
 *
 * A row that has never carried a preference leaves the cache alone: somebody
 * who set SGD in this browser before the column existed keeps SGD rather than
 * being reset to the column default, and the next save writes it up.
 */
export async function hydrateWorkspacePreferences(userId?: string | null): Promise<WorkspacePreferences> {
  const current: WorkspacePreferences = {
    reportingCurrency: getReportingCurrency(),
    openingCashBalance: getOpeningCashBalance(),
  };
  if (!canUseAccountStore(userId)) return current;

  try {
    const { data, error } = await supabaseClient!
      .from(TABLE_NAME)
      .select('reporting_currency, opening_cash_balance')
      .eq('id', userId as string)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return current;

    const storedCurrency = String(data.reporting_currency || '').trim().toUpperCase();
    if (isSupported(storedCurrency) && storedCurrency !== current.reportingCurrency) {
      setReportingCurrency(storedCurrency);
      current.reportingCurrency = storedCurrency as SupportedCurrency;
    }

    const storedBalance = data.opening_cash_balance;
    if (storedBalance === null || storedBalance === undefined) {
      // The account says "not answered". Anything sitting in this browser is a
      // pre-cloud answer worth keeping, not a stale value to erase.
      return current;
    }
    const parsed = Number(storedBalance);
    if (Number.isFinite(parsed) && parsed !== current.openingCashBalance) {
      setOpeningCashBalance(parsed);
      current.openingCashBalance = parsed;
    }
    return current;
  } catch (error) {
    debugPreferences('could not read account preferences; keeping this browser\'s copy', error);
    return current;
  }
}

export async function saveReportingCurrencyPreference(
  currency: string,
  userId?: string | null,
): Promise<PreferenceSaveResult> {
  const normalized = String(currency || '').trim().toUpperCase();
  if (!isSupported(normalized)) {
    return { savedToAccount: false, savedLocally: false, problem: `${currency} is not a currency Memoire reports in.` };
  }

  const savedLocally = setReportingCurrency(normalized);
  return finish(
    savedLocally,
    await writeToAccount({ reporting_currency: normalized }, userId),
    'reporting currency',
  );
}

export async function saveOpeningCashBalancePreference(
  value: number | null,
  userId?: string | null,
): Promise<PreferenceSaveResult> {
  const normalized = value === null || !Number.isFinite(value) ? null : value;
  const savedLocally = setOpeningCashBalance(normalized);
  return finish(
    savedLocally,
    await writeToAccount({ opening_cash_balance: normalized }, userId),
    'opening cash balance',
  );
}

async function writeToAccount(patch: Record<string, unknown>, userId?: string | null): Promise<AccountWrite> {
  if (!canUseAccountStore(userId)) return 'no-account';
  try {
    const { error } = await supabaseClient!
      .from(TABLE_NAME)
      .update(patch)
      .eq('id', userId as string);
    if (error) throw new Error(error.message);
    return 'saved';
  } catch (error) {
    debugPreferences('could not write account preferences', error);
    return 'failed';
  }
}

/**
 * Turns the two write results into one honest sentence.
 *
 * "Not signed in" and "sync is broken" both leave the answer in one browser,
 * and they are told apart because the fix is different: one is a thing to do,
 * the other is a thing to wait out. Reporting a demo session as a sync failure
 * would send somebody hunting a problem that does not exist.
 */
function finish(savedLocally: boolean, accountWrite: AccountWrite, subject: string): PreferenceSaveResult {
  const savedToAccount = accountWrite === 'saved';

  if (!savedLocally && !savedToAccount) {
    return {
      savedToAccount,
      savedLocally,
      problem: `Your ${subject} did not save. This browser refused the write and there is no account to fall back on.`,
    };
  }
  if (accountWrite === 'no-account') {
    return {
      savedToAccount,
      savedLocally,
      problem: `Saved in this browser. Sign in and your ${subject} follows you to every device.`,
    };
  }
  if (accountWrite === 'failed') {
    return {
      savedToAccount,
      savedLocally,
      problem: `Saved in this browser only - your account did not accept the change, so another device will still show the old ${subject}.`,
    };
  }
  if (!savedLocally) {
    return {
      savedToAccount,
      savedLocally,
      problem: 'Saved to your account, but this browser is out of storage space, so the change may not survive a reload here.',
    };
  }
  return { savedToAccount, savedLocally, problem: '' };
}

export { BASE_CURRENCY };

function debugPreferences(message: string, error: unknown) {
  if (!import.meta.env.DEV) return;
  console.debug('[WorkspacePreferences]', message, {
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}
