import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Memoire runs with NO AI service. Capture parsing and Ask answers are computed
// by rule, on the user's device. This contract is the guard: it fails the build
// if an AI dependency, endpoint, key, or client call is reintroduced - which
// would silently create a paid external dependency the operator did not choose.

// 1. No AI SDK dependency.
{
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of ['openai', '@anthropic-ai/sdk', 'groq-sdk', '@google/generative-ai', 'cohere-ai', 'langchain']) {
    assert.equal(deps[forbidden], undefined, `AI SDK dependency reintroduced: ${forbidden}`);
  }
}

// 2. No AI endpoint in api/.
{
  const files = existsSync('api') ? readdirSync('api') : [];
  for (const removed of ['ask-memoire.ts', 'capture-ai-classify.ts', 'generate-embedding.ts', 'search.ts', 'structure-capture.ts', '_captureAiPrompt.js']) {
    assert.equal(files.includes(removed), false, `AI endpoint reintroduced: api/${removed}`);
  }
  // Every remaining function is free of AI provider calls and keys.
  for (const file of files.filter((name) => name.endsWith('.ts') || name.endsWith('.js'))) {
    const source = readFileSync(`api/${file}`, 'utf8');
    for (const marker of ['openai', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'api.groq.com']) {
      assert.equal(source.includes(marker), false, `api/${file} references an AI provider: ${marker}`);
    }
  }
}

// 3. No client call to a removed AI endpoint, and no AI provider module.
{
  const clientFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) clientFiles.push(path);
    }
  };
  walk('src');

  for (const path of clientFiles) {
    const source = readFileSync(path, 'utf8');
    for (const endpoint of ['/api/ask-memoire', '/api/capture-ai-classify', '/api/generate-embedding', '/api/structure-capture', '/api/search']) {
      assert.equal(source.includes(endpoint), false, `${path} still calls a removed AI endpoint: ${endpoint}`);
    }
  }

  for (const removed of ['src/services/captureAiProvider.ts', 'src/utils/captureAiPrompt.ts']) {
    assert.equal(existsSync(removed), false, `AI provider module reintroduced: ${removed}`);
  }
}

// 4. No AI provider key is required to run Memoire. Production health must be
// green with none configured, and .env.example must not invite an operator to
// set one - a stale key placeholder is how a paid dependency creeps back in.
{
  const envExample = readFileSync('.env.example', 'utf8');
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GROQ_API_KEY', 'CAPTURE_AI_']) {
    assert.equal(envExample.includes(key), false, `.env.example still advertises an AI key: ${key}`);
  }

  const { evaluateProductionReadiness } = await import('./lib/production-readiness-runtime.mjs');
  const readiness = evaluateProductionReadiness({
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    VITE_APP_URL: 'https://memoire-blush-eta.vercel.app',
  });
  assert.equal(readiness.ok, true, 'production health must be green with no AI configuration');
  for (const check of readiness.checks) {
    assert.equal(
      check.severity === 'required' && /ai|openai|anthropic|groq|embedding/i.test(check.name),
      false,
      `production readiness must not require AI configuration: ${check.name}`,
    );
  }
}

// 5. The user-facing promise is honest: capture and Ask say the work is local.
{
  const capture = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
  assert.ok(capture.includes('On-device parsing'), 'capture must state that parsing is on-device');
  assert.ok(capture.includes('nothing is sent to an AI service'), 'capture must state that nothing is sent to an AI service');

  const ask = readFileSync('src/features/v31/AskMemoirePage.tsx', 'utf8');
  assert.ok(
    ask.includes('nothing was sent to an AI service'),
    'Ask Memoire must state that answers are computed locally',
  );
}

// 6. The legal pages say the same thing as the product.
//
// This one was found the hard way. The privacy policy carried an "AI-assisted
// features" section describing submitted text being sent to "the configured
// server-side AI provider", and the terms promised human review of
// "AI-assisted suggestions" - both written before the AI was removed, both
// surviving every check in this file, because nothing here read them.
//
// A legal document is the worst possible place for that error. It is the page a
// careful buyer reads before signing, the page a security review asks for, and
// since 2026-08-11 it is indexed and quotable by an answer engine. It described
// a data flow that does not exist, in the direction that loses trust.
{
  const legal = readFileSync('src/features/legal/LegalPage.tsx', 'utf8');
  for (const claim of ['AI-assisted', 'AI infrastructure', 'server-side AI provider']) {
    assert.equal(
      legal.includes(claim),
      false,
      `the legal pages describe an AI data flow that does not exist: "${claim}"`,
    );
  }
  assert.ok(
    legal.includes('Memoire has no AI provider, no AI API key and no AI endpoint.'),
    'the privacy policy must state plainly that there is no AI service',
  );
  assert.ok(
    legal.includes('Nothing you write is sent to a language model'),
    'the privacy policy must state that nothing written is sent to a model',
  );
  assert.ok(
    legal.includes('There is no AI provider in this list because there is none in the product.'),
    'the service-provider list must account for the absence of an AI provider',
  );
}

// 7. No surface anywhere offers an AI capability.
//
// The legal page was not alone. The same sentence, in three dialects, was also
// on the in-app Boundaries tab ("AI-assisted text may be sent to the configured
// provider") and on Today ("AI assist is optional where configured") - one of
// them read by every paying operator. A grep is the only thing that finds the
// third copy of a claim, so this sweeps the whole client rather than naming
// files, and new files are covered the day they are written.
{
  const offers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        // Comments are where the removal is explained, so they are exempt;
        // rendered copy is not. Block comments go first because a JSX comment
        // is `{/* ... */}` and its continuation lines start with plain prose.
        const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const line of source.split('\n')) {
          if (/^\s*\/\//.test(line)) continue;
          // Sentence by sentence, not line by line. "No CRM writeback. AI
          // assist is optional where configured." is one line containing both
          // an unrelated denial and a live AI offer, and a line-level check
          // reads the first and clears the second - which is exactly how the
          // Today page kept that sentence for two months.
          for (const sentence of line.split(/(?<=\.)\s+/)) {
            if (!/\bAI[- ](assist|assisted|powered|generated|provider|endpoint|service)\b/i.test(sentence)) continue;
            // A denial is the point of this contract, not a violation of it.
            if (/\b(no|not|nothing|never|none)\b/i.test(sentence)) continue;
            offers.push(`${path}: ${sentence.trim().slice(0, 100)}`);
          }
        }
      }
    }
  };
  walk('src');
  assert.deepEqual(offers, [], `a surface still offers an AI capability:\n${offers.join('\n')}`);
}

console.log('No-AI-dependency contract verified.');
