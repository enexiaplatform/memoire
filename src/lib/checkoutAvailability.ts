import { fetchBillingStatus } from './billing';

/**
 * Whether this deployment can actually take money right now.
 *
 * The trial needs this, and the reason is worth stating plainly: locking
 * somebody out of a product they cannot buy is an outage we caused. Checkout is
 * held shut by `BILLING_CHECKOUT_ENABLED`, and while it is shut an expired
 * trial has nothing to convert into - the operator would meet a wall with no
 * door in it. So the entitlement rule refuses to expire anyone until the store
 * is open, and this module is how it finds out.
 *
 * Unknown is treated as closed. A failed status call, a deployment with no
 * Lemon Squeezy keys, and a genuinely disabled flag all mean the same thing to
 * the person at the keyboard, and the generous reading is the safe one.
 *
 * Cached for the session because the answer is a deployment fact, not user
 * state: it cannot change between two screens of the same visit.
 */

let checkoutOpen: boolean | null = null;
let inFlight: Promise<void> | null = null;

export const CHECKOUT_AVAILABILITY_EVENT = 'memoire:checkout-availability';

/** Synchronous read. `null` means "not answered yet", which callers treat as closed. */
export function getCheckoutOpen(): boolean | null {
  return checkoutOpen;
}

/** Fires the status call once per session. Safe to call from render effects. */
export function ensureCheckoutAvailability(): void {
  if (checkoutOpen !== null || inFlight) return;
  inFlight = fetchBillingStatus()
    .then((status) => {
      // A null status means billing is not configured on this deployment at
      // all, which is as closed as a disabled flag.
      checkoutOpen = Boolean(status?.checkoutEnabled) && (status?.plans.length ?? 0) > 0;
    })
    .catch(() => {
      checkoutOpen = false;
    })
    .finally(() => {
      inFlight = null;
      window.dispatchEvent(new CustomEvent(CHECKOUT_AVAILABILITY_EVENT));
    });
}

/** Test seam. Resets the session cache so a suite can drive both branches. */
export function resetCheckoutAvailabilityForTests(value: boolean | null = null): void {
  checkoutOpen = value;
  inFlight = null;
}
