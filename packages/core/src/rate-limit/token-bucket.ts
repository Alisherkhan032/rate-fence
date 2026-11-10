import type { RateLimiter, RateLimiterDeps } from "./types.js";
import type { RateLimitResult } from "../types/rate-limit.js";

interface TokenBucketState {
  tokens: number;
  lastRefillAt: number;
}

export function createTokenBucketLimiter(
  options: { capacity: number; refillRate: number; tokensPerRequest?: number },
  deps: RateLimiterDeps,
): RateLimiter {
  const capacity = options.capacity;
  const refillRate = options.refillRate;
  const tokensPerRequest = options.tokensPerRequest ?? 1;
  const { store, clock, stateKey } = deps;

  // TTL: time to fully refill from empty, plus buffer
  const ttlMs = Math.ceil((capacity / refillRate) * 1000) + 60_000;

  return {
    consume(clientKey: string): RateLimitResult {
      const now = clock.now();
      const key = `${stateKey}:${clientKey}`;
      let state = store.get<TokenBucketState>(key);

      if (!state) {
        state = { tokens: capacity, lastRefillAt: now };
      } else {
        const elapsedSec = Math.max(0, (now - state.lastRefillAt) / 1000);
        const refilled = state.tokens + elapsedSec * refillRate;
        state.tokens = Math.min(capacity, refilled);
        state.lastRefillAt = now;
      }

      if (state.tokens < tokensPerRequest) {
        const deficit = tokensPerRequest - state.tokens;
        const retryAfterMs = Math.ceil((deficit / refillRate) * 1000);
        store.set(key, state, ttlMs);
        return {
          allowed: false,
          limit: capacity,
          remaining: Math.max(0, Math.floor(state.tokens)),
          resetAt: now + retryAfterMs,
          retryAfterMs,
        };
      }

      state.tokens -= tokensPerRequest;
      // Avoid floating dust
      if (state.tokens < 1e-9) {
        state.tokens = 0;
      }
      store.set(key, state, ttlMs);

      return {
        allowed: true,
        limit: capacity,
        remaining: Math.max(0, Math.floor(state.tokens)),
        resetAt: now + Math.ceil(((capacity - state.tokens) / refillRate) * 1000),
      };
    },
  };
}
