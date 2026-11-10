import { describe, expect, it } from "vitest";
import { isRequestTooLarge } from "../src/protection/request-size.js";
import { createRateFence } from "../src/create-rate-fence.js";
import { FakeClock } from "../src/clock/system-clock.js";

describe("request size", () => {
  it("detects oversized content length", () => {
    expect(isRequestTooLarge(100, 50)).toBe(true);
    expect(isRequestTooLarge(50, 50)).toBe(false);
    expect(isRequestTooLarge(undefined, 50)).toBe(false);
    expect(isRequestTooLarge(100, undefined)).toBe(false);
  });

  it("rejects via evaluate", async () => {
    const fence = createRateFence({
      maxRequestBytes: 10,
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
    });
    const decision = await fence.evaluate({
      requestId: "1",
      ip: "203.0.113.1",
      method: "POST",
      path: "/upload",
      timestamp: 0,
      headers: {},
      contentLength: 100,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("request_too_large");
    await fence.close();
  });
});
