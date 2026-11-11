import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { DEFAULT_RATE_LIMIT, resolveConfig } from "../src/config/defaults.js";
import { createRateFence } from "../src/create-rate-fence.js";
import type { RequestContext } from "../src/types/context.js";

function ctx(ip = "203.0.113.10"): RequestContext {
  return {
    requestId: "1",
    ip,
    method: "GET",
    path: "/",
    timestamp: 0,
    headers: {},
  };
}

describe("default rate limit", () => {
  it("resolves omitted rateLimit to sliding-window 100/60s", () => {
    const resolved = resolveConfig({});
    expect(resolved.rateLimit).toEqual(DEFAULT_RATE_LIMIT);
    expect(resolved.rateLimit?.algorithm).toBe("sliding-window");
    expect(resolved.rateLimit && "maxRequests" in resolved.rateLimit && resolved.rateLimit.maxRequests).toBe(
      100,
    );
  });

  it("disables global rate limiting when rateLimit is false", () => {
    const resolved = resolveConfig({ rateLimit: false });
    expect(resolved.rateLimit).toBeUndefined();
  });

  it("keeps an explicit rateLimit config", () => {
    const resolved = resolveConfig({
      rateLimit: { algorithm: "fixed-window", windowMs: 1_000, maxRequests: 2 },
    });
    expect(resolved.rateLimit).toEqual({
      algorithm: "fixed-window",
      windowMs: 1_000,
      maxRequests: 2,
    });
  });

  it("applies default limit when createRateFence has no rateLimit", async () => {
    const clock = new FakeClock(0);
    const fence = createRateFence({
      clock,
      storeConfig: { cleanupIntervalMs: 0 },
    });

    for (let i = 0; i < 100; i += 1) {
      const decision = await fence.evaluate(ctx());
      expect(decision.allowed).toBe(true);
    }

    const blocked = await fence.evaluate(ctx());
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("rate_limit_exceeded");
    await fence.close();
  });

  it("does not rate limit when rateLimit is false", async () => {
    const fence = createRateFence({
      rateLimit: false,
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
    });

    for (let i = 0; i < 150; i += 1) {
      const decision = await fence.evaluate(ctx());
      expect(decision.allowed).toBe(true);
      expect(decision.rateLimit).toBeUndefined();
    }

    await fence.close();
  });
});
