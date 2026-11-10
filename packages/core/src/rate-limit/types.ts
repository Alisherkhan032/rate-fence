import type { Clock } from "../clock/types.js";
import type { StateStore } from "../storage/types.js";
import type { RateLimitAlgorithmConfig, RateLimitResult } from "../types/rate-limit.js";

export interface RateLimiter {
  consume(clientKey: string): RateLimitResult;
}

export interface RateLimiterDeps {
  store: StateStore;
  clock: Clock;
  stateKey: string;
}

export type { RateLimitAlgorithmConfig, RateLimitResult };
