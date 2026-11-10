export type RateLimitAlgorithmConfig =
  | {
      algorithm: "fixed-window";
      windowMs: number;
      maxRequests: number;
    }
  | {
      algorithm: "sliding-window";
      windowMs: number;
      maxRequests: number;
    }
  | {
      algorithm: "token-bucket";
      capacity: number;
      /** Tokens added per second. */
      refillRate: number;
      tokensPerRequest?: number;
    };

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Absolute unix timestamp in milliseconds when the window resets / next token available. */
  resetAt: number;
  retryAfterMs?: number;
}
