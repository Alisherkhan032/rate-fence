import type { RateFenceConfig } from "../types/config.js";
import type { RateLimitAlgorithmConfig } from "../types/rate-limit.js";
import type { Policy } from "../types/policy.js";

function assertPlainObject(value: unknown, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected a plain object`);
  }
}

function assertPositiveInt(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`Invalid ${label}: expected a positive integer`);
  }
}

function assertPositiveNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${label}: expected a positive number`);
  }
}

export function validateRateLimitConfig(config: RateLimitAlgorithmConfig, label = "rateLimit"): void {
  assertPlainObject(config, label);
  if (config.algorithm === "fixed-window" || config.algorithm === "sliding-window") {
    assertPositiveInt(config.windowMs, `${label}.windowMs`);
    assertPositiveInt(config.maxRequests, `${label}.maxRequests`);
    return;
  }
  if (config.algorithm === "token-bucket") {
    assertPositiveNumber(config.capacity, `${label}.capacity`);
    assertPositiveNumber(config.refillRate, `${label}.refillRate`);
    if (config.tokensPerRequest !== undefined) {
      assertPositiveNumber(config.tokensPerRequest, `${label}.tokensPerRequest`);
    }
    return;
  }
  throw new Error(`Invalid ${label}.algorithm: expected fixed-window | sliding-window | token-bucket`);
}

function validatePolicy(policy: Policy): void {
  if (!policy.name || typeof policy.name !== "string") {
    throw new Error("Invalid policy.name: expected a non-empty string");
  }
  if (policy.priority !== undefined && typeof policy.priority !== "number") {
    throw new Error(`Invalid policy.priority for "${policy.name}"`);
  }
  if (policy.rateLimit) {
    validateRateLimitConfig(policy.rateLimit, `policy[${policy.name}].rateLimit`);
  }
  if (policy.action && !["block", "allow", "continue"].includes(policy.action)) {
    throw new Error(`Invalid policy.action for "${policy.name}"`);
  }
}

/**
 * Validate configuration at createRateFence() time. Fail fast on unsafe/invalid options.
 */
export function validateConfig(config: RateFenceConfig): void {
  assertPlainObject(config, "config");

  // Prototype pollution guard for config object own keys.
  for (const key of Object.keys(config)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error("Invalid config: dangerous key rejected");
    }
  }

  if (config.rateLimit === false) {
    // Explicit disable — valid.
  } else if (config.rateLimit !== undefined) {
    validateRateLimitConfig(config.rateLimit);
  }

  if (config.maxRequestBytes !== undefined) {
    assertPositiveInt(config.maxRequestBytes, "maxRequestBytes");
  }

  if (config.concurrency) {
    assertPlainObject(config.concurrency, "concurrency");
    if (config.concurrency.global !== undefined) {
      assertPositiveInt(config.concurrency.global, "concurrency.global");
    }
    if (config.concurrency.perClient !== undefined) {
      assertPositiveInt(config.concurrency.perClient, "concurrency.perClient");
    }
    if (config.concurrency.perRoute !== undefined) {
      assertPositiveInt(config.concurrency.perRoute, "concurrency.perRoute");
    }
  }

  if (config.policies) {
    if (!Array.isArray(config.policies)) {
      throw new Error("Invalid policies: expected an array");
    }
    for (const policy of config.policies) {
      validatePolicy(policy);
    }
  }

  if (config.threatDetection) {
    assertPlainObject(config.threatDetection, "threatDetection");
    if (typeof config.threatDetection.enabled !== "boolean") {
      throw new Error("Invalid threatDetection.enabled: expected boolean");
    }
  }

  if (config.fingerprint) {
    assertPlainObject(config.fingerprint, "fingerprint");
    if (typeof config.fingerprint.enabled !== "boolean") {
      throw new Error("Invalid fingerprint.enabled: expected boolean");
    }
  }

  if (config.storeConfig) {
    assertPlainObject(config.storeConfig, "storeConfig");
    if (config.storeConfig.maxEntries !== undefined) {
      assertPositiveInt(config.storeConfig.maxEntries, "storeConfig.maxEntries");
    }
    if (config.storeConfig.cleanupIntervalMs !== undefined) {
      if (
        typeof config.storeConfig.cleanupIntervalMs !== "number" ||
        config.storeConfig.cleanupIntervalMs < 0
      ) {
        throw new Error("Invalid storeConfig.cleanupIntervalMs");
      }
    }
  }
}

export { validatePolicy };
