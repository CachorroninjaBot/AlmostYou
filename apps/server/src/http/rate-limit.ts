export interface RateLimitDecision {
  limited: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  track(ip: string): RateLimitDecision;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  now?: () => number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const MAX_TRACKED_IPS = 5_000;

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const now = options.now ?? Date.now;
  const requests = new Map<string, number[]>();

  return {
    track(ip) {
      const timestamp = now();
      const recent = (requests.get(ip) ?? []).filter(
        (at) => timestamp - at < windowMs,
      );
      recent.push(timestamp);
      requests.set(ip, recent);
      if (requests.size > MAX_TRACKED_IPS) requests.clear();

      if (recent.length <= maxRequests) return { limited: false, retryAfterSeconds: 0 };

      // A retry only succeeds once enough entries expire to get back under the limit.
      const blocking = recent[recent.length - maxRequests - 1]!;
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((blocking + windowMs - timestamp) / 1000)),
      };
    },
  };
}
