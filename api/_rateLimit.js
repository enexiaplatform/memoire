const buckets = new Map();
const MAX_BUCKETS = 2_000;

export function enforceRateLimit(req, scope, identity, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const clientAddress = getClientAddress(req);
  const key = `${scope}:${identity || clientAddress}`;
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

function getClientAddress(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || 'unknown';
  return req.socket?.remoteAddress || 'unknown';
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
