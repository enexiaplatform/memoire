// Stripe client-side initialization
// Note: Stripe.js is loaded via @stripe/stripe-js on the frontend
// Server-side Stripe operations happen in api/stripe-webhook.ts

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  console.warn(
    'Stripe publishable key is missing. Set VITE_STRIPE_PUBLISHABLE_KEY in your .env file.'
  );
}

export const getStripePublishableKey = (): string => {
  return stripePublishableKey || '';
};
