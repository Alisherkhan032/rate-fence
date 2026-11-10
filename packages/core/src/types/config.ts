import type { KeyGenerator } from "./context.js";
import type { IpAccessConfig, Policy } from "./policy.js";
import type { RateLimitAlgorithmConfig } from "./rate-limit.js";
import type { StateStore } from "../storage/types.js";
import type { Clock } from "../clock/types.js";

export type TrustProxyConfig =
  | boolean
  | {
      /** Number of trusted proxy hops from the right of X-Forwarded-For. */
      hopCount?: number;
      /** CIDR/IP list of trusted proxies. */
      proxies?: string[];
    };

export interface FingerprintConfig {
  enabled: boolean;
  includeUserAgent?: boolean;
  includeAcceptLanguage?: boolean;
}

export interface ThreatRuleConfig {
  enabled?: boolean;
  threshold?: number;
  windowMs?: number;
  /** Temporary block duration when threshold exceeded. */
  blockTtlMs?: number;
  /** Apply a stricter rate limit instead of / in addition to block. */
  stricterRateLimit?: RateLimitAlgorithmConfig;
}

export interface ThreatDetectionConfig {
  enabled: boolean;
  rules?: {
    excessive404?: ThreatRuleConfig;
    failedAuthentication?: ThreatRuleConfig;
    highBurst?: ThreatRuleConfig;
    sensitiveEndpoint?: ThreatRuleConfig;
    multiRouteScan?: ThreatRuleConfig;
    oversizedPayload?: ThreatRuleConfig;
    repeatedBlocked?: ThreatRuleConfig;
  };
  sensitivePaths?: string[];
}

export interface ConcurrencyConfig {
  global?: number;
  perClient?: number;
  perRoute?: number;
}

export interface MemoryStoreConfig {
  maxEntries?: number;
  cleanupIntervalMs?: number;
}

export interface RateFenceConfig {
  rateLimit?: RateLimitAlgorithmConfig;
  trustProxy?: TrustProxyConfig;
  keyGenerator?: KeyGenerator;
  fingerprint?: FingerprintConfig;
  threatDetection?: ThreatDetectionConfig;
  concurrency?: ConcurrencyConfig;
  maxRequestBytes?: number;
  ipAccess?: IpAccessConfig;
  policies?: Policy[];
  store?: StateStore;
  storeConfig?: MemoryStoreConfig;
  clock?: Clock;
}
