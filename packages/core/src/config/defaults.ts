import type { RateFenceConfig } from "../types/config.js";
import type { RateLimitAlgorithmConfig } from "../types/rate-limit.js";

/** Secure-by-default global rate limit when `rateLimit` is omitted. */
export const DEFAULT_RATE_LIMIT: RateLimitAlgorithmConfig = {
  algorithm: "sliding-window",
  windowMs: 60_000,
  maxRequests: 100,
};

/**
 * Config after defaults are applied.
 * `rateLimit: false` becomes `undefined` (disabled).
 * Omitted `rateLimit` becomes {@link DEFAULT_RATE_LIMIT}.
 */
export type ResolvedRateFenceConfig = Omit<RateFenceConfig, "rateLimit"> & {
  rateLimit?: RateLimitAlgorithmConfig;
};

export function resolveConfig(config: RateFenceConfig): ResolvedRateFenceConfig {
  if (config.rateLimit === false) {
    const { rateLimit: _disabled, ...rest } = config;
    return rest;
  }

  if (config.rateLimit === undefined) {
    return {
      ...config,
      rateLimit: DEFAULT_RATE_LIMIT,
    };
  }

  return {
    ...config,
    rateLimit: config.rateLimit,
  };
}
