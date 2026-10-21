const WINDOW_MS = 60_000;
const LIMIT = 30;
const MAX_BUCKETS = 5_000;

interface Bucket {
  count: number;
  reset: number;
}

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.reset < now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return { ok: true, remaining: LIMIT - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > LIMIT) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
    };
  }

  return { ok: true, remaining: LIMIT - bucket.count, retryAfterSeconds: 0 };
}
