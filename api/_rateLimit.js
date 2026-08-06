const buckets = new Map();
const MAX_BUCKETS = 2_000;

/**
 * Two buckets, not one.
 *
 * The identity bucket is the useful one: it is what stops the same person
 * submitting the same form six times, and it is keyed on something meaningful -
 * an email, an anonymous id, an event name. The problem is that on every public
 * endpoint here, the caller *chooses* that identity. A script rotating the email
 * on each POST to /api/request-access got a fresh bucket every time and was
 * never limited at all; the same held for the anonymous id on /api/product-events,
 * both of which insert with the service-role key.
 *
 * So the address bucket sits behind it as the ceiling. It is deliberately looser
 * - shared NATs and corporate egress are real and a lead form must not punish an
 * office - but it is bounded, and it is keyed on something the caller cannot
 * simply make up.
 */
export function enforceRateLimit(req, scope, identity, limit = 12, windowMs = 60_000, options = {}) {
  const identityResult = takeToken(`${scope}:id:${identity || getClientAddress(req)}`, limit, windowMs);

  // No second bucket when the identity *is* the address: limiting the same key
  // twice would halve the stated limit for callers who supplied no identity.
  if (!identity) return identityResult;

  const addressLimit = Math.max(limit, Math.round(options.addressLimit ?? limit * 5));
  const addressResult = takeToken(`${scope}:ip:${getClientAddress(req)}`, addressLimit, windowMs);
  if (addressResult.allowed) return identityResult;

  // The caller is told the limit they actually hit, so Retry-After is truthful.
  return addressResult;
}

function takeToken(key, limit, windowMs) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    pruneBuckets(now);
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: 0,
  };
}

export function applyRateLimitHeaders(res, result) {
  if (!res?.setHeader) return;
  res.setHeader('X-RateLimit-Limit', String(result.limit ?? ''));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining ?? ''));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((result.resetAt || Date.now()) / 1000)));
  if (!result.allowed && result.retryAfterSeconds) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
  }
}

export function rateLimitExceeded(res, result, message = 'Too many requests') {
  applyRateLimitHeaders(res, result);
  return res.status(429).json({
    error: message,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

/**
 * Which address to hold a caller to.
 *
 * `x-forwarded-for` is read last on purpose. A client may send that header
 * itself, and the proxy appends rather than replaces, so its leftmost value is
 * whatever the caller wrote there - which makes it a fine hint for a log and a
 * useless key for a limit somebody is trying to get around. The two headers
 * ahead of it are written by the platform edge and cannot be set from outside,
 * so they are what the ceiling is keyed on where they exist.
 */
function getClientAddress(req) {
  const trusted = firstHeaderValue(req, 'x-vercel-forwarded-for') || firstHeaderValue(req, 'x-real-ip');
  if (trusted) return trusted;
  const forwarded = firstHeaderValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded;
  return req.socket?.remoteAddress || 'unknown';
}

function firstHeaderValue(req, name) {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  return value.split(',')[0]?.trim() || '';
}

function pruneBuckets(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const oldestKey = buckets.keys().next().value;
  if (typeof oldestKey === 'string') buckets.delete(oldestKey);
}
