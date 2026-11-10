import type { Clock } from "../clock/types.js";
import type { StateStore } from "../storage/types.js";
import { StoreKeys } from "../storage/keys.js";
import type { ConcurrencyConfig } from "../types/config.js";
import type { ConcurrencyTicket } from "../types/decision.js";

export type ConcurrencyRejectScope = "global" | "perClient" | "perRoute";

export interface ConcurrencyAcquireResult {
  ok: true;
  ticket: ConcurrencyTicket;
}

export interface ConcurrencyRejectResult {
  ok: false;
  scope: ConcurrencyRejectScope;
}

export type ConcurrencyResult = ConcurrencyAcquireResult | ConcurrencyRejectResult;

interface Counter {
  count: number;
}

export class ConcurrencyGuard {
  private globalActive = 0;

  constructor(
    private readonly config: ConcurrencyConfig,
    private readonly store: StateStore,
    private readonly _clock: Clock,
  ) {}

  get activeGlobal(): number {
    return this.globalActive;
  }

  acquire(options: {
    clientKey: string;
    routeKey?: string;
    limits?: ConcurrencyConfig;
  }): ConcurrencyResult {
    const limits: ConcurrencyConfig = {
      global: options.limits?.global ?? this.config.global,
      perClient: options.limits?.perClient ?? this.config.perClient,
      perRoute: options.limits?.perRoute ?? this.config.perRoute,
    };

    const acquired: Array<{ key: string; isGlobal?: boolean }> = [];

    const tryInc = (
      key: string,
      limit: number | undefined,
      scope: ConcurrencyRejectScope,
      isGlobal = false,
    ): ConcurrencyRejectResult | undefined => {
      if (limit === undefined) {
        return undefined;
      }
      if (isGlobal) {
        if (this.globalActive >= limit) {
          return { ok: false, scope };
        }
        this.globalActive += 1;
        acquired.push({ key, isGlobal: true });
        return undefined;
      }

      const counter = this.store.getOrSet<Counter>(key, () => ({ count: 0 }));
      if (counter.count >= limit) {
        return { ok: false, scope };
      }
      counter.count += 1;
      this.store.set(key, counter);
      acquired.push({ key });
      return undefined;
    };

    const rejectGlobal = tryInc(StoreKeys.concurrencyGlobal(), limits.global, "global", true);
    if (rejectGlobal) {
      return rejectGlobal;
    }

    if (options.routeKey && limits.perRoute !== undefined) {
      const rejectRoute = tryInc(
        StoreKeys.concurrencyRoute(options.routeKey),
        limits.perRoute,
        "perRoute",
      );
      if (rejectRoute) {
        this.rollback(acquired);
        return rejectRoute;
      }
    }

    const rejectClient = tryInc(
      StoreKeys.concurrencyClient(options.clientKey),
      limits.perClient,
      "perClient",
    );
    if (rejectClient) {
      this.rollback(acquired);
      return rejectClient;
    }

    let released = false;
    const ticket: ConcurrencyTicket = {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.rollback(acquired);
      },
    };

    return { ok: true, ticket };
  }

  private rollback(acquired: Array<{ key: string; isGlobal?: boolean }>): void {
    for (let i = acquired.length - 1; i >= 0; i -= 1) {
      const item = acquired[i]!;
      if (item.isGlobal) {
        this.globalActive = Math.max(0, this.globalActive - 1);
        continue;
      }
      const counter = this.store.get<Counter>(item.key);
      if (!counter) {
        continue;
      }
      counter.count = Math.max(0, counter.count - 1);
      if (counter.count === 0) {
        this.store.delete(item.key);
      } else {
        this.store.set(item.key, counter);
      }
    }
  }
}
