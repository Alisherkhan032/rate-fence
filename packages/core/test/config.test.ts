import { describe, expect, it } from "vitest";
import { createRateFence } from "../src/create-rate-fence.js";

describe("config validation", () => {
  it("rejects invalid rateLimit", () => {
    expect(() =>
      createRateFence({
        rateLimit: { algorithm: "fixed-window", windowMs: -1, maxRequests: 10 },
      }),
    ).toThrow(/windowMs/);
  });

  it("rejects dangerous keys", () => {
    const config = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() => createRateFence(config)).toThrow(/dangerous key/);
  });
});
