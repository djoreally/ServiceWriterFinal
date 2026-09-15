/**
 * Simple in-memory sliding window rate limiter for public routes
 */

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 60000);
    if (record.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 300000);

export function checkRateLimit(
  identifier: string,
  limit: number = 60,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const record = store.get(identifier) || { timestamps: [] };

  // Keep only timestamps within window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = windowMs - (now - oldest);
    return { allowed: false, remaining: 0, resetMs };
  }

  record.timestamps.push(now);
  store.set(identifier, record);

  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}
