// These are existing Enexia targets, reserved from staging automation.
const reservedRefs = new Set(['mlmpcpkucurylkrobain', 'sfutajxyudwrdnjpzurk']);

export function stagingBackend(ref, ...urls) {
  if (typeof ref !== 'string' || !/^[a-z0-9]{20}$/.test(ref) || reservedRefs.has(ref)) {
    throw new Error('A distinct approved staging project ref is required.');
  }
  const expected = 'https://' + ref + '.supabase.co';
  if (!urls.length || urls.some(url => ![expected, expected + '/'].includes(url))) {
    throw new Error('All Supabase URLs must point to the exact approved staging project.');
  }
  return expected;
}

export function stagingKey(key, ref, role) {
  const modernPrefix = role === 'anon' ? 'sb_publishable_' : 'sb_secret_';
  if (typeof key === 'string' && key.startsWith(modernPrefix) && key.length > modernPrefix.length) return key;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (claims.ref === ref && claims.role === role) return key;
  } catch {
    // Reject malformed keys without including them in diagnostics.
  }
  throw new Error('Use the approved staging project key for ' + role + '.');
}

// Use alongside GoTrue verification on the approved staging origin.
export function assertStagingSession(token, ref, backend, userId) {
  const origin = stagingBackend(ref, backend);
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (claims.iss === origin + '/auth/v1' && claims.sub === userId && claims.role === 'authenticated' &&
        (claims.ref === undefined || claims.ref === ref) &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(claims.session_id ?? '')) return;
  } catch {
    // Do not include the token in diagnostics.
  }
  throw new Error('Auth session is not bound to the approved staging issuer and user.');
}

export function stagingOrigin(value) {
  if (!value || !/^https:\/\/memoire-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(value)) {
    throw new Error('Use the dedicated Memoire staging Vercel origin.');
  }
  return value;
}

export function stagingDatabase(value, ref) {
  stagingBackend(ref, 'https://' + ref + '.supabase.co');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Staging database URL is malformed.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== 'db.' + ref + '.supabase.co' || (url.port && url.port !== '5432') ||
    url.pathname !== '/postgres' || url.username !== 'postgres' ||
    url.search !== '?sslmode=require' || url.hash || !url.password) {
    throw new Error('Use a direct TLS connection to the approved staging project.');
  }
  return url;
}

export function required(env, key) {
  if (!env[key]) throw new Error('Missing ' + key);
  return env[key];
}
