import type { RateLimitResult } from "./rate-limit.js";

export type DecisionReason =
  | "allowed"
  | "rate_limit_exceeded"
  | "ip_blocked"
  | "policy_denied"
  | "suspicious_activity"
  | "concurrency_limit_exceeded"
  | "request_too_large"
  | "client_blocked";

export interface SecurityDecision {
  allowed: boolean;
  reason: DecisionReason;
  statusCode?: number;
  retryAfterMs?: number;
  policyName?: string;
  rateLimit?: Pick<RateLimitResult, "limit" | "remaining" | "resetAt">;
  /** Present when a concurrency slot was acquired and must be released by the adapter. */
  concurrencyTicket?: ConcurrencyTicket;
}

export interface ConcurrencyTicket {
  release: () => void;
}
