import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../auth/authContext';
import { useDemoWorkspaceMode } from './useDemoWorkspaceMode';
import { isSupabaseConfigured } from '../lib/demoMode';
import {
  CHECKOUT_AVAILABILITY_EVENT,
  ensureCheckoutAvailability,
  getCheckoutOpen,
} from '../lib/checkoutAvailability';
import { resolveEntitlement, type Entitlement } from '../utils/entitlement';

/**
 * The one hook a screen asks "may this account do that?".
 *
 * It resolves to `unbilled` - fully permissive - in three cases that all mean
 * the same thing: there is no subscription to check. The demo sandbox runs on
 * sample data in this browser, a deployment with no Supabase has no accounts at
 * all, and a profile that has not finished loading has not yet said anything.
 * Locking the workspace during any of those would punish people for the app's
 * own loading order.
 *
 * It also waits on whether checkout is open before it will report anyone
 * expired - see src/lib/checkoutAvailability.ts for why.
 */
export function useEntitlement(): Entitlement {
  const { profile, isAuthenticated } = useAuthContext();
  const demoActive = useDemoWorkspaceMode();
  const [checkoutOpen, setCheckoutOpen] = useState(() => getCheckoutOpen());

  const billable = !demoActive && isSupabaseConfigured && isAuthenticated;

  useEffect(() => {
    if (!billable) return;
    ensureCheckoutAvailability();
    const sync = () => setCheckoutOpen(getCheckoutOpen());
    window.addEventListener(CHECKOUT_AVAILABILITY_EVENT, sync);
    // The answer can already be cached from an earlier mount, in which case no
    // event is coming and this is the only read that will happen.
    sync();
    return () => window.removeEventListener(CHECKOUT_AVAILABILITY_EVENT, sync);
  }, [billable]);

  return useMemo(() => {
    if (!billable) return resolveEntitlement(null);
    return resolveEntitlement(profile, { checkoutOpen: checkoutOpen === true });
    // `profile` is replaced wholesale by the auth provider, so identity is a
    // sound dependency; the two fields read are never mutated in place.
  }, [billable, checkoutOpen, profile]);
}
