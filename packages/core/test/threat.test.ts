import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { createRateFence } from "../src/create-rate-fence.js";
import type { RequestContext } from "../src/types/context.js";

function ctx(ip = "203.0.113.10"): RequestContext {
  return {
    requestId: "r",
    ip,
    method: "GET",
    path: "/x",
    timestamp: 1,
    headers: {},
  };
}

describe("threat detection", () => {
  it("temporarily blocks after failed authentication threshold", async () => {
    const clock = new FakeClock(1_000);
    const fence = createRateFence({
      clock,
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: false,
      threatDetection: {
        enabled: true,
        rules: {
          failedAuthentication: {
            enabled: true,
            threshold: 3,
            windowMs: 60_000,
            blockTtlMs: 30_000,
          },
        },
      },
    });

    fence.reportSignal({ type: "authentication.failure", key: "203.0.113.10" });
    fence.reportSignal({ type: "authentication.failure", key: "203.0.113.10" });
    expect((await fence.evaluate(ctx())).allowed).toBe(true);

    fence.reportSignal({ type: "authentication.failure", key: "203.0.113.10" });
    const blocked = await fence.evaluate(ctx());
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("client_blocked");

    clock.advance(30_001);
    expect((await fence.evaluate(ctx())).allowed).toBe(true);
    await fence.close();
  });

  it("emits threat.detected events", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: false,
      threatDetection: {
        enabled: true,
        rules: {
          excessive404: { enabled: true, threshold: 2, windowMs: 60_000, blockTtlMs: 10_000 },
        },
      },
    });

    const events: string[] = [];
    fence.on("threat.detected", (e) => events.push(e.rule));

    fence.reportSignal({ type: "response.status", key: "k", status: 404 });
    fence.reportSignal({ type: "response.status", key: "k", status: 404 });
    expect(events).toContain("excessive404");
    await fence.close();
  });

  it("does not run omitted rules like sensitiveEndpoint", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: false,
      threatDetection: {
        enabled: true,
        rules: {
          failedAuthentication: {
            threshold: 100,
            windowMs: 60_000,
            blockTtlMs: 60_000,
          },
        },
      },
    });

    const loginCtx: RequestContext = {
      ...ctx(),
      path: "/login",
      method: "POST",
    };

    for (let i = 0; i < 25; i += 1) {
      const decision = await fence.evaluate(loginCtx);
      expect(decision.allowed).toBe(true);
    }

    await fence.close();
  });

  it("blocks sensitiveEndpoint only when opted in", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: false,
      threatDetection: {
        enabled: true,
        rules: {
          sensitiveEndpoint: {
            threshold: 3,
            windowMs: 60_000,
            blockTtlMs: 60_000,
          },
        },
      },
    });

    const loginCtx: RequestContext = {
      ...ctx(),
      path: "/login",
      method: "POST",
    };

    expect((await fence.evaluate(loginCtx)).allowed).toBe(true);
    expect((await fence.evaluate(loginCtx)).allowed).toBe(true);
    expect((await fence.evaluate(loginCtx)).allowed).toBe(true);

    const blocked = await fence.evaluate(loginCtx);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("client_blocked");
    await fence.close();
  });
});
