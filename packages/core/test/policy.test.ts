import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { createRateFence } from "../src/create-rate-fence.js";
import type { RequestContext } from "../src/types/context.js";

function ctx(partial: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: "req-1",
    ip: "203.0.113.10",
    method: "GET",
    path: "/api/users",
    timestamp: 1_000,
    headers: {},
    ...partial,
  };
}

describe("policy engine", () => {
  it("blocks via policy action", async () => {
    const fence = createRateFence({
      clock: new FakeClock(1_000),
      storeConfig: { cleanupIntervalMs: 0 },
      policies: [
        {
          name: "deny-admin",
          priority: 100,
          match: { pathPrefix: "/admin" },
          action: "block",
        },
      ],
    });

    const denied = await fence.evaluate(ctx({ path: "/admin/users" }));
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("policy_denied");
    await fence.close();
  });

  it("applies route-specific rate limit replacing global", async () => {
    const clock = new FakeClock(1_000);
    const fence = createRateFence({
      clock,
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 100 },
    });

    fence.addPolicy({
      name: "login-protection",
      priority: 10,
      match: { path: "/api/auth/login", methods: ["POST"] },
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 2 },
    });

    const login = ctx({ path: "/api/auth/login", method: "POST" });
    expect((await fence.evaluate(login)).allowed).toBe(true);
    expect((await fence.evaluate(login)).allowed).toBe(true);
    expect((await fence.evaluate(login)).allowed).toBe(false);

    // Global path still uses higher limit
    expect((await fence.evaluate(ctx({ path: "/api/users" }))).allowed).toBe(true);
    await fence.close();
  });

  it("allowlist bypasses IP blocklist but not rate limits", async () => {
    const fence = createRateFence({
      clock: new FakeClock(1_000),
      storeConfig: { cleanupIntervalMs: 0 },
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 1 },
      ipAccess: {
        allowlist: ["203.0.113.10"],
        blocklist: ["203.0.113.10"],
      },
    });

    const first = await fence.evaluate(ctx());
    expect(first.allowed).toBe(true);
    const second = await fence.evaluate(ctx());
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("rate_limit_exceeded");
    await fence.close();
  });

  it("blocklist denies non-allowlisted IPs", async () => {
    const fence = createRateFence({
      clock: new FakeClock(1_000),
      storeConfig: { cleanupIntervalMs: 0 },
      ipAccess: { blocklist: ["198.51.100.0/24"] },
    });

    const denied = await fence.evaluate(ctx({ ip: "198.51.100.5" }));
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("ip_blocked");
    await fence.close();
  });
});
