import type { RequestContext } from "./context.js";
import type { RateLimitAlgorithmConfig } from "./rate-limit.js";

export type PolicyAction = "block" | "allow" | "continue";

export interface PolicyMatch {
  path?: string;
  pathPrefix?: string;
  pathRegex?: RegExp;
  methods?: string[];
}

export interface PolicyConcurrencyConfig {
  perClient?: number;
  perRoute?: number;
}

export interface Policy {
  name: string;
  /** Higher priority evaluated first. Default 0. */
  priority?: number;
  match?: PolicyMatch;
  condition?: (context: RequestContext) => boolean;
  /**
   * - block: deny the request
   * - allow: skip remaining IP-deny checks only (rate limits still apply)
   * - continue: no action effect (default)
   */
  action?: PolicyAction;
  rateLimit?: RateLimitAlgorithmConfig;
  concurrency?: PolicyConcurrencyConfig;
}

export interface IpAccessConfig {
  allowlist?: string[];
  blocklist?: string[];
}
