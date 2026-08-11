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

const app = read('src/App.tsx');
for (const marker of [
  'path="/privacy"',
  'to="/legal/privacy"',
  'path="/terms"',
  'to="/legal/terms"',
  'path="/legal/:document"',
  'LegalPage',
]) {
  requireIncludes(app, marker, `public legal route missing marker: ${marker}`);
}

// The three AI markers that used to sit in this list were removed on
// 2026-08-11, and they are the reason this comment is long.
//
// They required the privacy policy to carry an "AI-assisted features" section
// describing text being sent to "the configured server-side AI provider", and
// to warn against submitting confidential customer information to it. All of
// that was true when written. The AI was removed in June; the disclosure was
// not, because this contract insisted on it. For two months the legal page told
// every reader that their notes might leave the device, while
// verify-no-ai-dependency.mjs proved on every build that they could not.
//
// A marker contract pins whatever it was given. When behaviour is deliberately
// removed, its contract is part of what has to go with it - otherwise the
// contract is the thing keeping the false claim alive.
//
// The replacements below are the inverse assertion, so the same class of drift
// cannot happen in the other direction: if an AI provider is ever reintroduced,
// these fail until the legal copy is updated to say so.
const legalPage = read('src/features/legal/LegalPage.tsx');
for (const marker of [
  'Privacy Policy',
  'Terms of Service',
  'Product and Data Boundaries',
  'Memoire has no AI provider, no AI API key and no AI endpoint.',
  'Nothing you write is sent to a language model',
  'Memoire is not an AI product.',
  // Was 'early-access product'. The early-access framing was retired on
  // 2026-08-11: the product charges $10 a month and anyone can sign up, so
  // terms describing an invite-only trial period described a programme that had
  // already ended. What the terms must still carry is the honest limit - this
  // is a preparation tool, not a system of record - and now the commercial
  // terms too, which they had never mentioned at all.
  'not as a system of record, legal record, or guaranteed forecast',
  'Refunds are not offered on completed charges.',
  'Statutory rights that apply where you live are not affected by this paragraph.',
  'human review',
  'does not silently update external systems',
  'does not currently provide enterprise SSO, team administration, or native CRM writeback',
  // Three data flows that do exist. The policy described none of them while it
  // was busy describing one that did not: the product takes card details
  // through a processor, sends digests containing account names through an
  // email provider, and puts shared-brief content in a URL anyone can read.
  'Lemon Squeezy',
  'transactional email provider',
  'the part after the # - which browsers do not send to any server',
  // The address itself is no longer typed here. It was typed literally in five
  // places - both legal documents, the marketing footer, the Settings export
  // panel and the early-access form - all of them `hello@memoire.app`, on a
  // product served from memoire-official.com. What this contract cares about is
  // that the legal page tells the reader where to write, and that there is
  // exactly one place to change the answer.
  'CONTACT_EMAIL',
]) {
  requireIncludes(legalPage, marker, `legal page missing trust-boundary marker: ${marker}`);
}

const contact = read('src/config/contact.ts');
requireIncludes(contact, 'export const CONTACT_EMAIL', 'the contact address must have one home');
if (!/export const CONTACT_EMAIL = '[^'@\s]+@[^'@\s]+\.[a-z]{2,}';/.test(contact)) {
  failures.push('CONTACT_EMAIL must be a single well-formed address');
}

const boundariesTab = read('src/features/settings/BoundariesTab.tsx');
for (const marker of [
  'Data and Product Boundaries',
  'where human review is required',
  'No CRM writeback, enterprise SSO, team administration, or manager scoring is available today.',
  // Was 'AI-assisted text may be sent to the configured provider only when you
  // explicitly use that feature.' - see the note above the legal-page markers.
  // This is the same false claim on the surface a paying operator reads.
  'Nothing you write is sent to an AI service.',
  'View full product boundaries',
  'to="/legal/boundaries"',
]) {
  requireIncludes(boundariesTab, marker, `settings boundaries tab missing marker: ${marker}`);
}

// Search & Insights is a bounded, deterministic query surface, not a chatbot.
// The supported questions are listed on the page for the same reason the
// no-AI promise is: an open text box that implies unlimited natural-language
// intelligence is a claim the product cannot keep.
const askMemoire = read('src/features/v31/AskMemoirePage.tsx');
for (const marker of [
  'Search &amp; Insights',
  'What this can answer',
  'Who needs follow-up?',
  'Where is money stuck?',
  'Which commitments are overdue?',
  'What do I owe today?',
  'Every answer is computed on this device from your own records.',
  'Answered from your workspace using rules - nothing was sent to an AI service.',
  'There is not enough recorded yet to answer that from your workspace.',
  'Answers are built on this device from your captured data.',
  'Nothing is sent to an AI service, so no',
]) {
  requireIncludes(askMemoire, marker, `Search & Insights missing local-answer marker: ${marker}`);
}

const dailyCapture = read('src/features/dailyCapture/DailyCapturePage.tsx');
// Capture parses on-device by rule; the boundary promise is now "nothing
// leaves the browser", which is stronger than the old AI-disclosure wording.
for (const marker of [
  'On-device parsing',
  'nothing is sent to an AI service',
  'Confirm or correct every field before saving',
  'Needs confirmation',
]) {
  requireIncludes(dailyCapture, marker, `Daily Capture missing on-device disclosure marker: ${marker}`);
}

const pipelineDefense = read('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx');
for (const marker of [
  'Mock AI draft',
  'Deterministic local drafting only. No AI API or network request is used.',
  'Draft provider: {providerLabel}',
  'Generating local draft...',
]) {
  requireIncludes(pipelineDefense, marker, `Pipeline Defense draft boundary missing marker: ${marker}`);
}

// A dated review record, kept as written. What this now checks is that it
// cannot be mistaken for a description of the product: its "Product Truth"
// section lists AI data flows that were removed in June, and a reader who
// missed the supersession note would take them for current.
const boundaryDoc = read('docs/product/ai-disclosure-boundary-hardening-2026-06-17.md');
for (const marker of [
  'A8/R10 trust readiness',
  'does not replace legal review',
  'Superseded 2026-08-11: there is no AI',
  'Product Truth (as of 2026-06-17, no longer accurate - see above)',
  'scripts/verify-no-ai-dependency.mjs',
  'Legal review for the actual jurisdiction and business entity.',
]) {
  requireIncludes(boundaryDoc, marker, `AI disclosure hardening doc missing marker: ${marker}`);
}

const coverageDoc = read('docs/product/trust-boundary-contract-coverage-2026-06-17.md');
for (const marker of [
  'A8 remains open',
  'R10 remains open until deployed UX QA',
  'scripts/verify-trust-boundary-contract.mjs',
  'Runtime Evidence Still Required',
]) {
  requireIncludes(coverageDoc, marker, `trust-boundary coverage doc missing marker: ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-trust-boundary-contract.mjs', 'release gate does not reference trust-boundary verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-trust-boundary-contract.mjs', 'cohort packet does not reference trust-boundary verifier');

if (failures.length > 0) {
  console.error('Trust-boundary contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Trust-boundary contract verification passed.');
