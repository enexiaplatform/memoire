type RateLimitRequest = {
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();
const MAX_BUCKETS = 2_000;

export function enforceRateLimit(
  req: RateLimitRequest,
  scope: string,
  identity: string,
  limit = 12,
  windowMs = 60_000,
) {
  const now = Date.now();
  const clientAddress = getClientAddress(req);
  const key = `${scope}:${identity || clientAddress}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    pruneBuckets(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function getClientAddress(req: RateLimitRequest) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || 'unknown';
  return req.socket?.remoteAddress || 'unknown';
}

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const oldestKey = buckets.keys().next().value;
  if (typeof oldestKey === 'string') buckets.delete(oldestKey);
}

