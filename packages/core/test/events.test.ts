import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { createRateFence } from "../src/create-rate-fence.js";
import type { RequestContext } from "../src/types/context.js";

describe("events and stats", () => {
  it("does not break evaluate when listener throws", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
    });
    fence.on("request.allowed", () => {
      throw new Error("boom");
    });

    const decision = await fence.evaluate({
      requestId: "1",
      ip: "203.0.113.1",
      method: "GET",
      path: "/",
      timestamp: 0,
      headers: {},
    } satisfies RequestContext);

    expect(decision.allowed).toBe(true);
    await fence.close();
  });

  it("tracks stats", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 1 },
    });

    const ctx: RequestContext = {
      requestId: "1",
      ip: "203.0.113.1",
      method: "GET",
      path: "/",
      timestamp: 0,
      headers: {},
    };

    await fence.evaluate(ctx);
    await fence.evaluate(ctx);
    const stats = fence.getStats();
    expect(stats.totalEvaluated).toBe(2);
    expect(stats.allowed).toBe(1);
    expect(stats.blocked).toBe(1);
    expect(stats.rateLimitViolations).toBe(1);
    await fence.close();
  });

  it("supports unsubscribe", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
    });
    let count = 0;
    const off = fence.on("request.allowed", () => {
      count += 1;
    });
    const ctx: RequestContext = {
      requestId: "1",
      ip: "203.0.113.1",
      method: "GET",
      path: "/",
      timestamp: 0,
      headers: {},
    };
    await fence.evaluate(ctx);
    off();
    await fence.evaluate(ctx);
    expect(count).toBe(1);
    await fence.close();
  });
});
