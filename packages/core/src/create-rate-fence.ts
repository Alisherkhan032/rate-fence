import { systemClock } from "./clock/system-clock.js";
import type { Clock } from "./clock/types.js";
import { resolveConfig } from "./config/defaults.js";
import { validateConfig } from "./config/validate.js";
import { buildRequestContext } from "./context/build-context.js";
import { DecisionEngine } from "./engine/decision-engine.js";
import { EventBus } from "./events/event-bus.js";
import { PolicyRegistry } from "./policies/registry.js";
import { MemoryStateStore } from "./storage/memory-store.js";
import type { StateStore } from "./storage/types.js";
import { ThreatDetector } from "./threat/detector.js";
import type { RateFenceConfig } from "./types/config.js";
import type { BuildContextInput, KeyGenerator, RequestContext } from "./types/context.js";
import type { SecurityDecision } from "./types/decision.js";
import type { FenceEventName, FenceEvents } from "./types/events.js";
import type { Policy } from "./types/policy.js";
import type { SecuritySignal } from "./types/signals.js";
import type { FenceStats } from "./types/stats.js";

export { DEFAULT_RATE_LIMIT, resolveConfig } from "./config/defaults.js";
export type { ResolvedRateFenceConfig } from "./config/defaults.js";

export interface RateFence {
  /**
   * Evaluate a normalized request context and return an allow/deny decision.
   */
  evaluate(context: RequestContext, options?: { keyGenerator?: KeyGenerator }): Promise<SecurityDecision>;

  /**
   * Helper to build a RequestContext from raw HTTP fields.
   */
  buildContext(input: BuildContextInput): RequestContext;

  addPolicy(policy: Policy): void;
  removePolicy(name: string): boolean;
  blockClient(key: string, options?: { ttlMs?: number; reason?: string }): void;
  unblockClient(key: string): void;
  reportSignal(signal: SecuritySignal): void;
  getStats(): FenceStats;
  on<E extends FenceEventName>(event: E, listener: (payload: FenceEvents[E]) => void): () => void;
  /**
   * Release timers and clear in-memory state. Safe to call multiple times.
   */
  close(): Promise<void>;
}

/**
 * Create a RateFence instance.
 *
 * When `rateLimit` is omitted, a default sliding-window limit of 100 requests
 * per 60 seconds is applied. Pass `rateLimit: false` to disable global limiting.
 *
 * The default in-memory store is process-local. Multiple Node.js processes
 * do not share rate-limit or threat state.
 */
export function createRateFence(config: RateFenceConfig = {}): RateFence {
  validateConfig(config);
  const resolved = resolveConfig(config);

  const clock: Clock = resolved.clock ?? systemClock;
  const ownsStore = !resolved.store;
  const store: StateStore =
    resolved.store ??
    new MemoryStateStore({
      maxEntries: resolved.storeConfig?.maxEntries,
      cleanupIntervalMs: resolved.storeConfig?.cleanupIntervalMs,
      clock,
    });

  const events = new EventBus();
  const policies = new PolicyRegistry(resolved.policies ?? []);
  const threat = new ThreatDetector(
    resolved.threatDetection ?? { enabled: false },
    store,
    clock,
  );
  const engine = new DecisionEngine(resolved, store, clock, policies, events, threat);

  let closed = false;

  return {
    async evaluate(context, options) {
      if (closed) {
        throw new Error("RateFence has been closed");
      }
      return engine.evaluate(context, options?.keyGenerator);
    },

    buildContext(input) {
      return buildRequestContext(input, {
        trustProxy: resolved.trustProxy,
        fingerprint: resolved.fingerprint,
      });
    },

    addPolicy(policy) {
      policies.add(policy);
    },

    removePolicy(name) {
      return policies.remove(name);
    },

    blockClient(key, options) {
      engine.blockClient(key, options);
    },

    unblockClient(key) {
      engine.unblockClient(key);
    },

    reportSignal(signal) {
      const hits = threat.reportSignal(signal);
      engine.applyThreatHits(hits);
    },

    getStats() {
      return engine.getStats();
    },

    on(event, listener) {
      return events.on(event, listener);
    },

    async close() {
      if (closed) {
        return;
      }
      closed = true;
      events.removeAllListeners();
      if (ownsStore) {
        store.close();
      }
    },
  };
}
