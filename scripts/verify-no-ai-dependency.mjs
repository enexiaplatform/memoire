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

// 4. The user-facing promise is honest: capture and Ask say the work is local.
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

console.log('No-AI-dependency contract verified.');
