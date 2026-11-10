import type { RateLimiter, RateLimiterDeps } from "./types.js";
import type { RateLimitResult } from "../types/rate-limit.js";

interface FixedWindowState {
  windowStart: number;
  count: number;
}

export function createFixedWindowLimiter(
  options: { windowMs: number; maxRequests: number },
  deps: RateLimiterDeps,
): RateLimiter {
  const { windowMs, maxRequests } = options;
  const { store, clock, stateKey } = deps;

  return {
    consume(clientKey: string): RateLimitResult {
      const now = clock.now();
      const key = `${stateKey}:${clientKey}`;
      let state = store.get<FixedWindowState>(key);

      if (!state || now >= state.windowStart + windowMs) {
        state = { windowStart: now, count: 0 };
      }

      const resetAt = state.windowStart + windowMs;

      if (state.count >= maxRequests) {
        store.set(key, state, windowMs);
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          resetAt,
          retryAfterMs: Math.max(0, resetAt - now),
        };
      }

      state.count += 1;
      store.set(key, state, windowMs);

      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - state.count),
        resetAt,
      };
    },
  };
}
