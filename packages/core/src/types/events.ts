import type { DecisionReason } from "./decision.js";

export interface FenceEvents {
  "request.allowed": {
    ip: string;
    method: string;
    path: string;
    key: string;
    timestamp: number;
  };
  "request.blocked": {
    ip: string;
    method: string;
    path: string;
    key: string;
    reason: DecisionReason;
    policyName?: string;
    timestamp: number;
  };
  "rate_limit.exceeded": {
    ip: string;
    key: string;
    path: string;
    limit: number;
    retryAfterMs?: number;
    timestamp: number;
  };
  "threat.detected": {
    key: string;
    rule: string;
    ip?: string;
    timestamp: number;
  };
  "client.blocked": {
    key: string;
    reason?: string;
    ttlMs?: number;
    timestamp: number;
  };
  "policy.matched": {
    policyName: string;
    action: string;
    path: string;
    timestamp: number;
  };
  "concurrency.limit_exceeded": {
    key: string;
    scope: "global" | "perClient" | "perRoute";
    path: string;
    timestamp: number;
  };
}

export type FenceEventName = keyof FenceEvents;
