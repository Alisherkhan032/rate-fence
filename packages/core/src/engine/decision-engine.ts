import type { Clock } from "../clock/types.js";
import type { EventBus } from "../events/event-bus.js";
import { createIpAccessEvaluator } from "../policies/ip-access.js";
import { policyApplies } from "../policies/match.js";
import type { PolicyRegistry } from "../policies/registry.js";
import { ConcurrencyGuard } from "../protection/concurrency.js";
import { isRequestTooLarge } from "../protection/request-size.js";
import { createRateLimiter } from "../rate-limit/create-limiter.js";
import type { StateStore } from "../storage/types.js";
import { StoreKeys } from "../storage/keys.js";
import type { ThreatDetector, ThreatHit } from "../threat/detector.js";
import type { ResolvedRateFenceConfig } from "../config/defaults.js";
import type { KeyGenerator, RequestContext } from "../types/context.js";
import type { SecurityDecision } from "../types/decision.js";
import type { RateLimitAlgorithmConfig } from "../types/rate-limit.js";
import type { FenceStats } from "../types/stats.js";

interface BlockRecord {
  reason?: string;
  expiresAt?: number;
}

export class DecisionEngine {
  private readonly ipAccess;
  private readonly concurrency: ConcurrencyGuard;
  private readonly defaultKeyGenerator: KeyGenerator;
  private readonly stats: FenceStats = {
    totalEvaluated: 0,
    allowed: 0,
    blocked: 0,
    rateLimitViolations: 0,
    threatDetections: 0,
    concurrencyRejections: 0,
    activeConcurrentRequests: 0,
    activeTrackedClients: 0,
    storeEntryCount: 0,
  };

  constructor(
    private readonly config: ResolvedRateFenceConfig,
    private readonly store: StateStore,
    private readonly clock: Clock,
    private readonly policies: PolicyRegistry,
    private readonly events: EventBus,
    private readonly threat: ThreatDetector,
  ) {
    this.ipAccess = createIpAccessEvaluator(config.ipAccess);
    this.concurrency = new ConcurrencyGuard(config.concurrency ?? {}, store, clock);
    this.defaultKeyGenerator = config.keyGenerator ?? ((ctx) => ctx.ip);
  }

  getStats(): FenceStats {
    return {
      ...this.stats,
      activeConcurrentRequests: this.concurrency.activeGlobal,
      storeEntryCount: this.store.size(),
    };
  }

  blockClient(key: string, options?: { ttlMs?: number; reason?: string }): void {
    const record: BlockRecord = {
      reason: options?.reason,
      expiresAt: options?.ttlMs !== undefined ? this.clock.now() + options.ttlMs : undefined,
    };
    this.store.set(StoreKeys.block(key), record, options?.ttlMs);
    this.events.emit("client.blocked", {
      key,
      reason: options?.reason,
      ttlMs: options?.ttlMs,
      timestamp: this.clock.now(),
    });
  }

  unblockClient(key: string): void {
    this.store.delete(StoreKeys.block(key));
  }

  applyThreatHits(hits: ThreatHit[]): void {
    for (const hit of hits) {
      this.stats.threatDetections += 1;
      this.events.emit("threat.detected", {
        key: hit.key,
        rule: hit.rule,
        timestamp: this.clock.now(),
      });
      if (hit.blockTtlMs) {
        this.blockClient(hit.key, {
          ttlMs: hit.blockTtlMs,
          reason: `threat:${hit.rule}`,
        });
      }
    }
  }

  evaluate(context: RequestContext, keyGenerator?: KeyGenerator): SecurityDecision {
    this.stats.totalEvaluated += 1;
    const key = (keyGenerator ?? this.defaultKeyGenerator)(context);

    const decision = this.evaluateInner(context, key);

    if (decision.allowed) {
      this.stats.allowed += 1;
      this.events.emit("request.allowed", {
        ip: context.ip,
        method: context.method,
        path: context.path,
        key,
        timestamp: context.timestamp,
      });
    } else {
      this.stats.blocked += 1;
      this.events.emit("request.blocked", {
        ip: context.ip,
        method: context.method,
        path: context.path,
        key,
        reason: decision.reason,
        policyName: decision.policyName,
        timestamp: context.timestamp,
      });
    }

    return decision;
  }

  private evaluateInner(context: RequestContext, key: string): SecurityDecision {
    // 1. Manual / temporary client blocks
    if (this.isBlocked(key) || (key !== context.ip && this.isBlocked(context.ip))) {
      return {
        allowed: false,
        reason: "client_blocked",
        statusCode: 403,
      };
    }

    const matchingPolicies = this.policies.list().filter((p) => policyApplies(p, context));

    // 2–4. Deny policies, then allow (IP-deny bypass only), then IP blocklist
    let skipIpDeny = this.ipAccess.isAllowlisted(context.ip);

    for (const policy of matchingPolicies) {
      const action = policy.action ?? "continue";
      if (action === "block") {
        this.events.emit("policy.matched", {
          policyName: policy.name,
          action,
          path: context.path,
          timestamp: context.timestamp,
        });
        return {
          allowed: false,
          reason: "policy_denied",
          statusCode: 403,
          policyName: policy.name,
        };
      }
      if (action === "allow") {
        skipIpDeny = true;
        this.events.emit("policy.matched", {
          policyName: policy.name,
          action,
          path: context.path,
          timestamp: context.timestamp,
        });
      }
    }

    if (!skipIpDeny && this.ipAccess.isBlocked(context.ip)) {
      return {
        allowed: false,
        reason: "ip_blocked",
        statusCode: 403,
      };
    }

    // 5. Request size
    if (isRequestTooLarge(context.contentLength, this.config.maxRequestBytes)) {
      return {
        allowed: false,
        reason: "request_too_large",
        statusCode: 413,
      };
    }

    const rateLimitPolicy = matchingPolicies.find((p) => p.rateLimit);
    const concurrencyPolicy = matchingPolicies.find((p) => p.concurrency);
    const effectiveRateLimit = rateLimitPolicy?.rateLimit ?? this.config.rateLimit;
    const effectiveConcurrency = {
      ...(this.config.concurrency ?? {}),
      ...(concurrencyPolicy?.concurrency ?? {}),
    };

    // 6. Concurrency
    const hasConcurrencyLimits =
      effectiveConcurrency.global !== undefined ||
      effectiveConcurrency.perClient !== undefined ||
      effectiveConcurrency.perRoute !== undefined;

    let concurrencyTicket = undefined;
    if (hasConcurrencyLimits) {
      const result = this.concurrency.acquire({
        clientKey: key,
        routeKey: context.routeId ?? `${context.method}:${context.path}`,
        limits: effectiveConcurrency,
      });
      if (!result.ok) {
        this.stats.concurrencyRejections += 1;
        this.events.emit("concurrency.limit_exceeded", {
          key,
          scope: result.scope,
          path: context.path,
          timestamp: context.timestamp,
        });
        return {
          allowed: false,
          reason: "concurrency_limit_exceeded",
          statusCode: 429,
        };
      }
      concurrencyTicket = result.ticket;
    }

    // 7. Rate limit
    if (effectiveRateLimit) {
      const rateDecision = this.consumeRateLimit(
        key,
        effectiveRateLimit,
        rateLimitPolicy?.name,
      );
      if (!rateDecision.allowed) {
        concurrencyTicket?.release();
        this.stats.rateLimitViolations += 1;
        this.events.emit("rate_limit.exceeded", {
          ip: context.ip,
          key,
          path: context.path,
          limit: rateDecision.limit,
          retryAfterMs: rateDecision.retryAfterMs,
          timestamp: context.timestamp,
        });
        return {
          allowed: false,
          reason: "rate_limit_exceeded",
          statusCode: 429,
          retryAfterMs: rateDecision.retryAfterMs,
          policyName: rateLimitPolicy?.name,
          rateLimit: {
            limit: rateDecision.limit,
            remaining: rateDecision.remaining,
            resetAt: rateDecision.resetAt,
          },
        };
      }

      // 8. Threat pattern recording (blocks apply to subsequent requests)
      if (this.threat.enabled) {
        const hits = this.threat.recordRequest(key, context.path);
        this.applyThreatHits(hits);
      }

      return {
        allowed: true,
        reason: "allowed",
        rateLimit: {
          limit: rateDecision.limit,
          remaining: rateDecision.remaining,
          resetAt: rateDecision.resetAt,
        },
        concurrencyTicket,
      };
    }

    if (this.threat.enabled) {
      const hits = this.threat.recordRequest(key, context.path);
      this.applyThreatHits(hits);
    }

    return {
      allowed: true,
      reason: "allowed",
      concurrencyTicket,
    };
  }

  private isBlocked(key: string): boolean {
    const block = this.store.get<BlockRecord>(StoreKeys.block(key));
    if (!block) {
      return false;
    }
    if (block.expiresAt !== undefined && block.expiresAt <= this.clock.now()) {
      this.store.delete(StoreKeys.block(key));
      return false;
    }
    return true;
  }

  private consumeRateLimit(
    clientKey: string,
    config: RateLimitAlgorithmConfig,
    policyName?: string,
  ) {
    const limiter = createRateLimiter(config, {
      store: this.store,
      clock: this.clock,
      stateKey: `rate:${config.algorithm}:${policyName ?? "global"}`,
    });
    return limiter.consume(clientKey);
  }
}
