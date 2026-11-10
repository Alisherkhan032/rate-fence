import type { RateLimitAlgorithmConfig } from "../types/rate-limit.js";
import { createFixedWindowLimiter } from "./fixed-window.js";
import { createSlidingWindowLimiter } from "./sliding-window.js";
import { createTokenBucketLimiter } from "./token-bucket.js";
import type { RateLimiter, RateLimiterDeps } from "./types.js";

export function createRateLimiter(
  config: RateLimitAlgorithmConfig,
  deps: RateLimiterDeps,
): RateLimiter {
  switch (config.algorithm) {
    case "fixed-window":
      return createFixedWindowLimiter(
        { windowMs: config.windowMs, maxRequests: config.maxRequests },
        deps,
      );
    case "sliding-window":
      return createSlidingWindowLimiter(
        { windowMs: config.windowMs, maxRequests: config.maxRequests },
        deps,
      );
    case "token-bucket":
      return createTokenBucketLimiter(
        {
          capacity: config.capacity,
          refillRate: config.refillRate,
          tokensPerRequest: config.tokensPerRequest,
        },
        deps,
      );
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown rate limit algorithm: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
