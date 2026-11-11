export { createRateFence, DEFAULT_RATE_LIMIT, resolveConfig } from "./create-rate-fence.js";
export type { RateFence, ResolvedRateFenceConfig } from "./create-rate-fence.js";

export { buildRequestContext } from "./context/build-context.js";
export { MemoryStateStore } from "./storage/memory-store.js";
export type { StateStore } from "./storage/types.js";
export { FakeClock, systemClock } from "./clock/system-clock.js";
export type { Clock } from "./clock/types.js";

export { normalizeIp, isValidIp } from "./ip/normalize.js";
export { CidrMatcher, matchesCidr } from "./ip/cidr.js";
export { extractClientIp } from "./ip/extract.js";

export {
  createFixedWindowLimiter,
  createSlidingWindowLimiter,
  createTokenBucketLimiter,
  createRateLimiter,
} from "./rate-limit/index.js";

export type {
  RequestContext,
  KeyGenerator,
  BuildContextInput,
  RateLimitAlgorithmConfig,
  RateLimitResult,
  DecisionReason,
  SecurityDecision,
  ConcurrencyTicket,
  Policy,
  PolicyAction,
  PolicyMatch,
  PolicyConcurrencyConfig,
  IpAccessConfig,
  SecuritySignal,
  FenceEvents,
  FenceEventName,
  FenceStats,
  StoreStats,
  RateFenceConfig,
  TrustProxyConfig,
  FingerprintConfig,
  ThreatDetectionConfig,
  ThreatRuleConfig,
  ConcurrencyConfig,
  MemoryStoreConfig,
} from "./types/index.js";
