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

/**
 * A site audit costs more than a page audit because it fetches and analyzes
 * a sample of pages. The bucket is shared so the weighted total is bounded.
 */
export function rateLimit(key: string, cost = 1): RateLimitResult {
  const now = Date.now();
  const amount = Math.max(1, Math.floor(cost));
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: amount, reset: now + WINDOW_MS });
    return { ok: true, remaining: Math.max(0, LIMIT - amount), retryAfterSeconds: 0 };
  }

  if (bucket.count + amount > LIMIT) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
    };
  }

  bucket.count += amount;
  return { ok: true, remaining: LIMIT - bucket.count, retryAfterSeconds: 0 };
}
