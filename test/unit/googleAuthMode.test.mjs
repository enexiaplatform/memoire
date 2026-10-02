import test from 'node:test';
import assert from 'node:assert/strict';
import { useGoogleRedirect } from '../../src/auth/googleAuthMode.ts';

test('configured production origin retains nonce-protected GIS', () => {
  assert.equal(useGoogleRedirect('https://www.memoire-official.com', 'https://www.memoire-official.com/'), false);
});
test('preview, local, other protocol and deceptive suffix use provider redirects', () => {
  for (const origin of ['https://memoire-git-main-enexiaplatforms-projects.vercel.app', 'http://127.0.0.1:5174', 'http://www.memoire-official.com', 'https://www.memoire-official.com.example.org']) {
    assert.equal(useGoogleRedirect(origin, 'https://www.memoire-official.com'), true);
  }
});
test('missing or invalid configured URL never crashes login', () => {
  for (const value of ['', 'not a URL']) assert.equal(useGoogleRedirect('https://preview.example', value), true);
});
