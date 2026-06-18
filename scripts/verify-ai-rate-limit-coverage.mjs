import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const expensiveEndpoints = [
  {
    route: '/api/ask-memoire',
    file: 'api/ask-memoire.ts',
    scope: 'ask-memoire',
    providerMarkers: ['await synthesize(question'],
  },
  {
    route: '/api/search',
    file: 'api/search.ts',
    scope: 'search',
    providerMarkers: ['generateEmbedding(query)', 'groq.chat.completions.create'],
  },
  {
    route: '/api/structure-capture',
    file: 'api/structure-capture.ts',
    scope: 'structure-capture',
    providerMarkers: ['const structured = process.env.ANTHROPIC_API_KEY'],
  },
  {
    route: '/api/capture-ai-classify',
    file: 'api/capture-ai-classify.ts',
    scope: 'capture-ai-classify',
    providerMarkers: ['callOpenAiCompatibleProvider(validation.request)'],
  },
  {
    route: '/api/generate-embedding',
    file: 'api/generate-embedding.ts',
    scope: 'generate-embedding',
    providerMarkers: ['generateEmbedding(text)'],
  },
];

const failures = [];

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function verifyEndpoint(endpoint) {
  const text = read(endpoint.file);
  const importMarker = "from './_rateLimit.js'";
  const scopeMarker = `enforceRateLimit(req, '${endpoint.scope}'`;
  const rateLimitIndex = text.indexOf(scopeMarker);

  if (!text.includes(importMarker)) fail(`${endpoint.route} does not import the shared rate-limit helper`);
  if (rateLimitIndex === -1) fail(`${endpoint.route} does not use expected scope ${endpoint.scope}`);
  if (!text.includes('rateLimit.allowed')) fail(`${endpoint.route} does not check rateLimit.allowed`);
  if (!text.includes('rateLimitExceeded(res, rateLimit')) fail(`${endpoint.route} does not use the shared 429 response helper`);

  for (const marker of endpoint.providerMarkers) {
    const providerIndex = text.indexOf(marker);
    if (providerIndex === -1) {
      fail(`${endpoint.route} is missing provider marker ${marker}`);
      continue;
    }
    if (rateLimitIndex === -1 || rateLimitIndex > providerIndex) {
      fail(`${endpoint.route} reaches provider marker before rate limit: ${marker}`);
    }
  }
}

for (const endpoint of expensiveEndpoints) verifyEndpoint(endpoint);

const helper = read('api/_rateLimit.js');
for (const header of ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']) {
  if (!helper.includes(header)) fail(`shared rate-limit helper does not set ${header}`);
}
if (!helper.includes('res.status(429).json')) fail('shared rate-limit helper does not return JSON 429 responses');
if (!helper.includes('retryAfterSeconds')) fail('shared rate-limit helper does not return retryAfterSeconds');

const firewall = JSON.parse(read('docs/deployment/vercel-firewall-cohort-rules.json'));
const firewallText = JSON.stringify(firewall);
for (const endpoint of expensiveEndpoints) {
  const routeName = endpoint.route.replace('/api/', '');
  if (!firewallText.includes(routeName)) fail(`firewall payload does not reference ${endpoint.route}`);
}
if (!firewallText.includes('rate_limit')) fail('firewall payload does not include a rate_limit action');

const contract = read('docs/deployment/app-rate-limit-contract-2026-06-17.md');
for (const endpoint of expensiveEndpoints) {
  if (!contract.includes(endpoint.route)) fail(`rate-limit contract does not list ${endpoint.route}`);
}

const coverageDoc = read('docs/deployment/ai-endpoint-rate-limit-coverage-2026-06-17.md');
for (const endpoint of expensiveEndpoints) {
  if (!coverageDoc.includes(endpoint.route)) fail(`coverage report does not list ${endpoint.route}`);
}
if (!coverageDoc.includes('A2 remains open')) fail('coverage report must state that A2 remains open');
if (!coverageDoc.includes('scripts/verify-rate-limit-runtime-contract.mjs')) {
  fail('coverage report does not reference the rate-limit runtime verifier');
}

const runtimeCoverageDoc = read('docs/deployment/rate-limit-runtime-contract-coverage-2026-06-17.md');
for (const marker of ['HTTP `429`', 'Retry-After', 'identity isolation', 'A2 remains open']) {
  if (!runtimeCoverageDoc.includes(marker)) fail(`runtime rate-limit coverage doc missing ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
if (!releaseGate.includes('scripts/verify-ai-rate-limit-coverage.mjs')) {
  fail('release gate does not reference the AI rate-limit verifier');
}
if (!releaseGate.includes('scripts/verify-rate-limit-runtime-contract.mjs')) {
  fail('release gate does not reference the rate-limit runtime verifier');
}

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
if (!packet.includes('scripts/verify-ai-rate-limit-coverage.mjs')) {
  fail('cohort release packet does not reference the AI rate-limit verifier');
}
if (!packet.includes('scripts/verify-rate-limit-runtime-contract.mjs')) {
  fail('cohort release packet does not reference the rate-limit runtime verifier');
}

const packageJson = read('package.json');
if (!packageJson.includes('"verify:rate-limit-runtime"')) fail('package.json missing verify:rate-limit-runtime script');
if (!packageJson.includes('npm run verify:rate-limit-runtime')) fail('npm run check does not include rate-limit runtime verifier');

if (failures.length > 0) {
  console.error('AI rate-limit coverage verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`AI rate-limit coverage verification passed (${expensiveEndpoints.length} endpoints).`);
