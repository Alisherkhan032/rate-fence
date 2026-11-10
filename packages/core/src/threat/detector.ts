import type { Clock } from "../clock/types.js";
import type { StateStore } from "../storage/types.js";
import { StoreKeys } from "../storage/keys.js";
import type { ThreatDetectionConfig, ThreatRuleConfig } from "../types/config.js";
import type { SecuritySignal } from "../types/signals.js";
import type { RateLimitAlgorithmConfig } from "../types/rate-limit.js";

interface WindowCounter {
  windowStart: number;
  count: number;
}

interface RouteSetState {
  windowStart: number;
  routes: string[];
}

export interface ThreatHit {
  rule: string;
  key: string;
  blockTtlMs?: number;
  stricterRateLimit?: RateLimitAlgorithmConfig;
}

const DEFAULT_RULES: Record<string, Required<Pick<ThreatRuleConfig, "threshold" | "windowMs" | "blockTtlMs">>> = {
  excessive404: { threshold: 20, windowMs: 60_000, blockTtlMs: 60_000 },
  failedAuthentication: { threshold: 10, windowMs: 300_000, blockTtlMs: 300_000 },
  highBurst: { threshold: 50, windowMs: 1_000, blockTtlMs: 30_000 },
  sensitiveEndpoint: { threshold: 20, windowMs: 60_000, blockTtlMs: 60_000 },
  multiRouteScan: { threshold: 30, windowMs: 60_000, blockTtlMs: 60_000 },
  oversizedPayload: { threshold: 5, windowMs: 60_000, blockTtlMs: 60_000 },
  repeatedBlocked: { threshold: 10, windowMs: 60_000, blockTtlMs: 120_000 },
};

function resolveRule(
  name: string,
  override?: ThreatRuleConfig,
): (Required<Pick<ThreatRuleConfig, "threshold" | "windowMs" | "blockTtlMs">> & ThreatRuleConfig) | undefined {
  if (override?.enabled === false) {
    return undefined;
  }
  const defaults = DEFAULT_RULES[name];
  if (!defaults) {
    return undefined;
  }
  // If rules object omits the rule entirely, treat as enabled with defaults when parent enabled.
  return {
    ...defaults,
    ...override,
    enabled: override?.enabled ?? true,
  };
}

export class ThreatDetector {
  private readonly sensitivePaths: string[];

  constructor(
    private readonly config: ThreatDetectionConfig,
    private readonly store: StateStore,
    private readonly clock: Clock,
  ) {
    this.sensitivePaths = config.sensitivePaths ?? [
      "/api/auth",
      "/login",
      "/admin",
      "/.env",
      "/wp-admin",
    ];
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  reportSignal(signal: SecuritySignal): ThreatHit[] {
    if (!this.config.enabled) {
      return [];
    }

    const at = signal.at ?? this.clock.now();
    const hits: ThreatHit[] = [];

    switch (signal.type) {
      case "authentication.failure": {
        const hit = this.bump("failedAuthentication", signal.key, at);
        if (hit) hits.push(hit);
        break;
      }
      case "response.status": {
        if (signal.status === 404) {
          const hit = this.bump("excessive404", signal.key, at);
          if (hit) hits.push(hit);
        }
        if (signal.path) {
          this.trackRoute(signal.key, signal.path, at);
          const multi = this.checkMultiRoute(signal.key, at);
          if (multi) hits.push(multi);
          if (this.isSensitive(signal.path)) {
            const hit = this.bump("sensitiveEndpoint", signal.key, at);
            if (hit) hits.push(hit);
          }
        }
        break;
      }
      case "payload.oversized": {
        const hit = this.bump("oversizedPayload", signal.key, at);
        if (hit) hits.push(hit);
        break;
      }
      case "request.blocked": {
        const hit = this.bump("repeatedBlocked", signal.key, at);
        if (hit) hits.push(hit);
        break;
      }
      case "authentication.success":
        // Clear failed auth counter on success.
        this.store.delete(StoreKeys.threat("failedAuthentication", signal.key));
        break;
      default:
        break;
    }

    return hits;
  }

  recordRequest(key: string, path: string): ThreatHit[] {
    if (!this.config.enabled) {
      return [];
    }
    const now = this.clock.now();
    const hits: ThreatHit[] = [];

    const burst = this.bump("highBurst", key, now);
    if (burst) hits.push(burst);

    this.trackRoute(key, path, now);
    const multi = this.checkMultiRoute(key, now);
    if (multi) hits.push(multi);

    if (this.isSensitive(path)) {
      const hit = this.bump("sensitiveEndpoint", key, now);
      if (hit) hits.push(hit);
    }

    return hits;
  }

  private bump(ruleName: string, key: string, at: number): ThreatHit | undefined {
    const rule = resolveRule(ruleName, this.config.rules?.[ruleName as keyof typeof this.config.rules]);
    if (!rule || rule.enabled === false) {
      return undefined;
    }

    const storeKey = StoreKeys.threat(ruleName, key);
    let state = this.store.get<WindowCounter>(storeKey);
    if (!state || at >= state.windowStart + rule.windowMs) {
      state = { windowStart: at, count: 0 };
    }
    state.count += 1;
    this.store.set(storeKey, state, rule.windowMs);

    if (state.count >= rule.threshold) {
      return {
        rule: ruleName,
        key,
        blockTtlMs: rule.blockTtlMs,
        stricterRateLimit: rule.stricterRateLimit,
      };
    }
    return undefined;
  }

  private trackRoute(key: string, path: string, at: number): void {
    const rule = resolveRule("multiRouteScan", this.config.rules?.multiRouteScan);
    if (!rule || rule.enabled === false) {
      return;
    }
    const storeKey = StoreKeys.threatRoutes(key);
    let state = this.store.get<RouteSetState>(storeKey);
    if (!state || at >= state.windowStart + rule.windowMs) {
      state = { windowStart: at, routes: [] };
    }
    if (!state.routes.includes(path)) {
      // Bound cardinality
      if (state.routes.length < 200) {
        state.routes.push(path);
      }
    }
    this.store.set(storeKey, state, rule.windowMs);
  }

  private checkMultiRoute(key: string, at: number): ThreatHit | undefined {
    const rule = resolveRule("multiRouteScan", this.config.rules?.multiRouteScan);
    if (!rule || rule.enabled === false) {
      return undefined;
    }
    const state = this.store.get<RouteSetState>(StoreKeys.threatRoutes(key));
    if (!state || at >= state.windowStart + rule.windowMs) {
      return undefined;
    }
    if (state.routes.length >= rule.threshold) {
      return {
        rule: "multiRouteScan",
        key,
        blockTtlMs: rule.blockTtlMs,
        stricterRateLimit: rule.stricterRateLimit,
      };
    }
    return undefined;
  }

  private isSensitive(path: string): boolean {
    return this.sensitivePaths.some((p) => path === p || path.startsWith(p));
  }
}
