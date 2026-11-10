import { describe, expect, it } from "vitest";
import { buildRequestContext } from "../src/context/build-context.js";

describe("buildRequestContext", () => {
  it("strips query string and normalizes method", () => {
    const ctx = buildRequestContext({
      method: "get",
      path: "/api/users?x=1",
      headers: { "user-agent": "test" },
      remoteAddress: "203.0.113.1",
    });
    expect(ctx.method).toBe("GET");
    expect(ctx.path).toBe("/api/users");
    expect(ctx.ip).toBe("203.0.113.1");
    expect(ctx.userAgent).toBe("test");
  });

  it("builds fingerprint when enabled", () => {
    const ctx = buildRequestContext(
      {
        method: "GET",
        path: "/",
        headers: { "user-agent": "ua", "accept-language": "en" },
        remoteAddress: "203.0.113.1",
      },
      { fingerprint: { enabled: true, includeUserAgent: true, includeAcceptLanguage: true } },
    );
    expect(ctx.fingerprint).toBeTruthy();
    expect(ctx.fingerprint!.length).toBe(32);
  });
});
