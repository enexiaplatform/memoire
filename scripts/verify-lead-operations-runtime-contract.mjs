import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function loadRequestAccessModule() {
  const source = readFileSync('api/request-access.ts', 'utf8')
    .replace(/^import .+;\r?\n/gm, '');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'memoire-lead-contract-'));
  const file = join(dir, `request-access-${Date.now()}.mjs`);
  writeFileSync(file, transpiled.outputText, 'utf8');
  const mod = await import(`file:///${file.replaceAll('\\', '/')}`);
  return {
    mod,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

let cleanup = () => {};

try {
  const loaded = await loadRequestAccessModule();
  cleanup = loaded.cleanup;
  const {
    buildLeadInsertPayload,
    cleanRoute,
    cleanText,
    isHoneypotSubmission,
  } = loaded.mod;

  assert(cleanText('  hello world  ', 8) === 'hello wo', 'cleanText should trim and cap text');
  assert(cleanText(123, 8) === '', 'cleanText should reject non-string values');
  assert(cleanRoute('/app/dashboard') === '/app/dashboard', 'cleanRoute should allow plain app routes');
  assert(cleanRoute('/app/dashboard?x=1') === '', 'cleanRoute should reject query strings');
  assert(cleanRoute('/app/dashboard#section') === '', 'cleanRoute should reject fragments');
  assert(cleanRoute('https://example.test/app') === '', 'cleanRoute should reject absolute URLs');

  const longPain = ` ${'pain'.repeat(100)} `;
  const validLead = buildLeadInsertPayload({
    name: '  Ada Seller  ',
    workEmail: ' ADA@EXAMPLE.COM ',
    role: '  Founder  ',
    currentTool: '  Spreadsheet  ',
    biggestPain: longPain,
    preferredUseCase: ` ${'Need pipeline review clarity. '.repeat(80)} `,
    consent: true,
    website: '',
  });

  assert(validLead.kind === 'lead', 'valid lead should build insert payload');
  assert(validLead.rateLimitIdentity === 'ada@example.com', 'valid lead should rate-limit by normalized work email');
  assert(validLead.payload.name === 'Ada Seller', 'lead name should be trimmed');
  assert(validLead.payload.work_email === 'ada@example.com', 'lead email should be normalized to lowercase');
  assert(validLead.payload.role === 'Founder', 'lead role should be trimmed');
  assert(validLead.payload.current_tool === 'Spreadsheet', 'lead current tool should be trimmed');
  assert(validLead.payload.biggest_pain.length === 240, 'lead biggest pain should be capped at 240 chars');
  assert(validLead.payload.preferred_use_case.length === 1200, 'lead preferred use case should be capped at 1200 chars');
  assert(validLead.payload.source === 'request_access_page', 'lead source should be request_access_page');
  assert(!('website' in validLead.payload), 'lead payload should not store honeypot website field');
  assert(!('consent' in validLead.payload), 'lead payload should not store raw consent boolean');
  assert(Number.isFinite(Date.parse(validLead.payload.consent_at)), 'lead payload should include consent_at timestamp');

  assert(buildLeadInsertPayload({ ...validLead.payload, consent: true }).kind === 'invalid', 'missing camel-case required fields should be invalid');
  assert(buildLeadInsertPayload({ name: 'Ada', workEmail: 'not-email', currentTool: 'CRM', preferredUseCase: 'Review', consent: true }).kind === 'invalid', 'invalid email should be rejected');
  assert(buildLeadInsertPayload({ name: 'Ada', workEmail: 'ada@example.com', currentTool: 'CRM', preferredUseCase: 'Review', consent: false }).kind === 'invalid', 'missing consent should be rejected');
  assert(buildLeadInsertPayload({ name: 'Ada', workEmail: 'ada@example.com', currentTool: '', preferredUseCase: 'Review', consent: true }).kind === 'invalid', 'missing current tool should be rejected');
  assert(isHoneypotSubmission({ website: 'spam bot' }), 'honeypot field should be detected');
  assert(buildLeadInsertPayload({ website: 'spam bot', name: 'Spam', workEmail: 'spam@example.com' }).kind === 'honeypot', 'honeypot lead should be classified quietly');

} finally {
  cleanup();
}

if (failures.length > 0) {
  console.error('Lead operations runtime contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Lead operations runtime contract verification passed.');
