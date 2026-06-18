import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireIncludes(text, marker, label) {
  if (!text.includes(marker)) fail(label);
}

const envExample = read('.env.example');
for (const marker of [
  'BILLING_CHECKOUT_ENABLED=false',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PERSONAL_PRICE_ID',
  'STRIPE_TEAM_PRICE_ID',
]) {
  requireIncludes(envExample, marker, `.env.example missing billing marker: ${marker}`);
}

const billingApi = read('api/billing.ts');
for (const marker of [
  "if (req.method !== 'POST') return res.status(405).end();",
  "if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Billing is not configured.' });",
  'verifyUserToken(authToken, userId)',
  "return res.status(401).json({ error: 'Unauthorized' })",
  "if (action === 'checkout')",
  "process.env.BILLING_CHECKOUT_ENABLED !== 'true'",
  "return res.status(503).json({ error: 'Checkout is not enabled.' })",
  'const allowedPriceIds = [process.env.STRIPE_PERSONAL_PRICE_ID, process.env.STRIPE_TEAM_PRICE_ID].filter(Boolean);',
  "return res.status(400).json({ error: 'Invalid price.' })",
  'metadata: { supabase_user_id: userId }',
  'subscription_data: { metadata: { supabase_user_id: userId } }',
  "success_url: `${appUrl}/app/capture?upgrade=success`",
  "cancel_url: `${appUrl}/pricing?upgrade=cancelled`",
  "if (action === 'portal')",
  "return res.status(400).json({ error: 'No billing account found' })",
  "return_url: `${appUrl}/app/settings`",
]) {
  requireIncludes(billingApi, marker, `billing API missing marker: ${marker}`);
}

const webhook = read('api/stripe-webhook.ts');
for (const marker of [
  'export const config = { api: { bodyParser: false } };',
  'STRIPE_WEBHOOK_SECRET',
  'stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)',
  "return res.status(400).json({ error: 'Invalid webhook signature.' })",
  "case 'customer.subscription.created':",
  "case 'customer.subscription.updated':",
  "sub.status === 'active' || sub.status === 'trialing'",
  "subscription_status: isActive ? 'active' : 'cancelled'",
  "subscription_tier: isActive ? tier : 'free'",
  "case 'customer.subscription.deleted':",
  "subscription_status: 'cancelled'",
  "subscription_tier: 'free'",
  "case 'checkout.session.completed':",
  "action: 'subscription_started'",
]) {
  requireIncludes(webhook, marker, `Stripe webhook missing marker: ${marker}`);
}

const pricing = read('src/features/pricing/PricingPage.tsx');
for (const marker of [
  'Early pricing hypothesis',
  'Pricing is still being validated.',
  'no payment checkout is active',
  'Request guided access',
  'Try demo first',
  'Not available yet',
  'No team checkout today',
  'No CRM writeback today',
]) {
  requireIncludes(pricing, marker, `pricing page missing paid-readiness marker: ${marker}`);
}
if (pricing.includes('useCheckout') || pricing.includes('startCheckout')) {
  fail('pricing page must not call checkout while B1-B6 are open');
}

const exposureGuard = read('docs/deployment/billing-checkout-exposure-guard-2026-06-17.md');
for (const marker of [
  'BILLING_CHECKOUT_ENABLED=false',
  'Only set it to `true` after:',
  'Paid offer selected.',
  'Stripe price ID confirmed.',
  'Billing payment QA passed.',
  'Billing support owner and refund/trial policy recorded.',
  'Pricing page matches the active offer.',
  'Legal review covers paid access.',
  'B1 selected paid offer.',
  'B3 Stripe test/live evidence.',
  'B4 named owners and test support case.',
  'B5 pricing page update.',
  'B6 paid-access legal review.',
  'Landing and pricing pages keep public checkout inactive',
]) {
  requireIncludes(exposureGuard, marker, `billing exposure guard missing marker: ${marker}`);
}

const billingQa = read('docs/qa/billing-payment-qa-2026-06-17.md');
for (const marker of [
  'One selected paid early-access offer.',
  'Stripe test-mode product and price IDs.',
  '`BILLING_CHECKOUT_ENABLED=true` only in the billing QA environment after offer/support/legal approval.',
  'B3-01',
  'B3-02',
  'B3-03',
  'B3-04',
  'B3-05',
  'B3-06',
  'B3-07',
  'B3-08',
  'B3-09',
  'B3-10',
  'B3-11',
  'B3-12',
  'B3-13',
  'B3-14',
  'B3-15',
  'B3 can pass only when:',
  'B3-01 through B3-15 pass in Stripe test mode.',
  'No checkout path is exposed on `/pricing` until B1, B4, B5, and B6 are ready.',
  'B4 can pass only when:',
]) {
  requireIncludes(billingQa, marker, `billing QA doc missing marker: ${marker}`);
}

const billingSupport = read('docs/operations/billing-support-runbook-2026-06-17.md');
for (const marker of [
  'This runbook does not authorize enabling checkout.',
  'A single paid offer is selected.',
  'Stripe test-mode and production-mode QA pass.',
  'Legal terms cover paid access, refunds, cancellations, service availability, export, and deletion obligations.',
  'Keep `BILLING_CHECKOUT_ENABLED=false` until B1, B3, B4, B5, and B6 are ready.',
  'Billing support owner:',
  'Backup owner:',
  'Stripe dashboard access owner:',
  'Refund approver:',
  'Legal/commercial approver:',
  'Never ask users to send full card details. Card data stays inside Stripe.',
  '| Checkout failed |',
  '| Portal failed |',
  '| Plan mismatch |',
  '| Cancellation request |',
  '| Refund request |',
  '| Failed payment |',
  '| Duplicate charge |',
  '| Account deletion with billing |',
  '| Dispute/chargeback |',
  'B4 can move from runbook-ready to operational evidence only when:',
  'Billing support owner and backup are named.',
  'Selected paid offer, price ID, refund policy, and trial policy are filled in.',
  'One test support ticket is run through the intake and resolution workflow.',
  'B3 payment QA, B5 pricing-page update, and B6 legal review remain open.',
]) {
  requireIncludes(billingSupport, marker, `billing support runbook missing marker: ${marker}`);
}

const coverageDoc = read('docs/product/billing-paid-readiness-contract-coverage-2026-06-17.md');
for (const marker of [
  'B1-B6 remain open',
  'scripts/verify-billing-paid-readiness-contract.mjs',
  'Runtime Evidence Still Required',
  'Do not enable checkout',
]) {
  requireIncludes(coverageDoc, marker, `billing paid-readiness coverage doc missing marker: ${marker}`);
}

const commercialVerifier = read('scripts/verify-commercial-readiness.mjs');
for (const marker of [
  'billing env flag defaults off',
  'billing API blocks checkout when flag is not enabled',
  'pricing page keeps checkout disconnected',
]) {
  requireIncludes(commercialVerifier, marker, `commercial verifier missing checkout exposure marker: ${marker}`);
}

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:billing-paid-readiness"', 'package.json missing verify:billing-paid-readiness script');
requireIncludes(packageJson, 'npm run verify:billing-paid-readiness', 'npm run check does not include billing paid-readiness verifier');

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-billing-paid-readiness-contract.mjs', 'release gate does not reference billing paid-readiness verifier');

const roadmap = read('docs/product/commercialization-roadmap-2026-06-16.md');
requireIncludes(roadmap, 'npm run verify:billing-paid-readiness', 'roadmap does not reference billing paid-readiness verifier');

if (failures.length > 0) {
  console.error('Billing paid-readiness contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Billing paid-readiness contract verification passed.');
