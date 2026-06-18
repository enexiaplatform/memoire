import { applyRateLimitHeaders, enforceRateLimit, rateLimitExceeded } from '../api/_rateLimit.js';

const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function makeReq(address = '203.0.113.10') {
  return {
    headers: {
      'x-forwarded-for': address,
    },
    socket: {
      remoteAddress: '198.51.100.25',
    },
  };
}

function makeRes() {
  return {
    headers: {},
    statusCode: undefined,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const scope = `runtime-contract-${runId}`;
const identity = `user-${runId}`;
const req = makeReq();

const first = enforceRateLimit(req, scope, identity, 2, 60_000);
const second = enforceRateLimit(req, scope, identity, 2, 60_000);
const blocked = enforceRateLimit(req, scope, identity, 2, 60_000);

assert(first.allowed === true, 'first request should be allowed');
assert(first.limit === 2, 'first request should report configured limit');
assert(first.remaining === 1, 'first request should leave one remaining request');
assert(first.retryAfterSeconds === 0, 'allowed request should not include retry delay');

assert(second.allowed === true, 'second request should be allowed');
assert(second.remaining === 0, 'second request should leave zero remaining requests');

assert(blocked.allowed === false, 'third request should be blocked');
assert(blocked.limit === 2, 'blocked request should report configured limit');
assert(blocked.remaining === 0, 'blocked request should report zero remaining requests');
assert(blocked.retryAfterSeconds >= 1, 'blocked request should include retryAfterSeconds');
assert(blocked.resetAt >= Date.now(), 'blocked request should include future resetAt');

const res = makeRes();
rateLimitExceeded(res, blocked, 'Runtime contract limit reached');

assert(res.statusCode === 429, 'rateLimitExceeded should return HTTP 429');
assert(res.body?.error === 'Runtime contract limit reached', '429 body should include custom error message');
assert(res.body?.retryAfterSeconds === blocked.retryAfterSeconds, '429 body should include retryAfterSeconds');
assert(res.headers['Retry-After'] === String(blocked.retryAfterSeconds), '429 should include Retry-After header');
assert(res.headers['X-RateLimit-Limit'] === '2', '429 should include X-RateLimit-Limit header');
assert(res.headers['X-RateLimit-Remaining'] === '0', '429 should include X-RateLimit-Remaining header');
assert(Boolean(res.headers['X-RateLimit-Reset']), '429 should include X-RateLimit-Reset header');
assert(Number(res.headers['X-RateLimit-Reset']) >= Math.floor(Date.now() / 1000), 'X-RateLimit-Reset should be a unix timestamp in seconds');

const allowedHeadersRes = makeRes();
applyRateLimitHeaders(allowedHeadersRes, second);
assert(allowedHeadersRes.headers['X-RateLimit-Limit'] === '2', 'allowed response headers should include X-RateLimit-Limit');
assert(allowedHeadersRes.headers['X-RateLimit-Remaining'] === '0', 'allowed response headers should include remaining count');
assert(!('Retry-After' in allowedHeadersRes.headers), 'allowed response headers should not include Retry-After');

const separateIdentity = enforceRateLimit(req, scope, `other-${identity}`, 2, 60_000);
assert(separateIdentity.allowed === true, 'rate-limit buckets should isolate different identities');

const separateScope = enforceRateLimit(req, `${scope}-other`, identity, 2, 60_000);
assert(separateScope.allowed === true, 'rate-limit buckets should isolate different scopes');

const addressScope = `runtime-address-${runId}`;
const addressReq = makeReq('192.0.2.77, 10.0.0.3');
enforceRateLimit(addressReq, addressScope, '', 1, 60_000);
const addressBlocked = enforceRateLimit(addressReq, addressScope, '', 1, 60_000);
assert(addressBlocked.allowed === false, 'missing identity should fall back to forwarded client address');

if (failures.length > 0) {
  console.error('Rate-limit runtime contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Rate-limit runtime contract verification passed.');
