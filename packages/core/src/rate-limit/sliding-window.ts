import type { RateLimiter, RateLimiterDeps } from "./types.js";
import type { RateLimitResult } from "../types/rate-limit.js";

interface SlidingWindowState {
  prevCount: number;
  currCount: number;
  currWindowStart: number;
}

/**
 * Memory-efficient sliding window counter.
 * Weighted count = prevCount * (1 - elapsed/window) + currCount
 */
export function createSlidingWindowLimiter(
  options: { windowMs: number; maxRequests: number },
  deps: RateLimiterDeps,
): RateLimiter {
  const { windowMs, maxRequests } = options;
  const { store, clock, stateKey } = deps;

  return {
    consume(clientKey: string): RateLimitResult {
      const now = clock.now();
      const key = `${stateKey}:${clientKey}`;
      let state = store.get<SlidingWindowState>(key);

      if (!state) {
        state = { prevCount: 0, currCount: 0, currWindowStart: now };
      } else {
        const elapsedWindows = Math.floor((now - state.currWindowStart) / windowMs);
        if (elapsedWindows === 1) {
          state = {
            prevCount: state.currCount,
            currCount: 0,
            currWindowStart: state.currWindowStart + windowMs,
          };
        } else if (elapsedWindows >= 2) {
          state = { prevCount: 0, currCount: 0, currWindowStart: now };
        }
      }

      const elapsed = Math.min(windowMs, Math.max(0, now - state.currWindowStart));
      const weight = 1 - elapsed / windowMs;
      const estimated = state.prevCount * weight + state.currCount;

      const resetAt = state.currWindowStart + windowMs;

      if (estimated >= maxRequests) {
        store.set(key, state, windowMs * 2);
        const retryAfterMs = Math.max(1, Math.ceil(resetAt - now));
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          resetAt,
          retryAfterMs,
        };
      }

      state.currCount += 1;
      store.set(key, state, windowMs * 2);

      const remaining = Math.max(0, Math.floor(maxRequests - (estimated + 1)));

      return {
        allowed: true,
        limit: maxRequests,
        remaining,
        resetAt,
      };
    },
  };
}
