import { describe, expect, it } from "vitest";
import { CidrMatcher, matchesCidr } from "../src/ip/cidr.js";
import { extractClientIp } from "../src/ip/extract.js";
import { normalizeIp } from "../src/ip/normalize.js";

describe("normalizeIp", () => {
  it("normalizes IPv4", () => {
    expect(normalizeIp(" 8.8.8.8 ")).toBe("8.8.8.8");
  });

  it("normalizes IPv4-mapped IPv6", () => {
    expect(normalizeIp("::ffff:192.0.2.10")).toBe("192.0.2.10");
  });

  it("lowercases IPv6 and strips zone", () => {
    expect(normalizeIp("FE80::1%eth0")).toBe("fe80::1");
  });

  it("rejects malformed", () => {
    expect(normalizeIp("not-an-ip")).toBeUndefined();
  });
});

describe("extractClientIp", () => {
  it("ignores X-Forwarded-For when trustProxy is false", () => {
    const ip = extractClientIp({
      remoteAddress: "203.0.113.10",
      headers: { "x-forwarded-for": "1.2.3.4" },
      trustProxy: false,
    });
    expect(ip).toBe("203.0.113.10");
  });

  it("uses trusted hop when trustProxy is true", () => {
    const ip = extractClientIp({
      remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" },
      trustProxy: true,
    });
    expect(ip).toBe("10.0.0.1");
  });

  it("uses hopCount from the right", () => {
    const ip = extractClientIp({
      remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.5, 10.0.0.1" },
      trustProxy: { hopCount: 2 },
    });
    expect(ip).toBe("203.0.113.5");
  });

  it("does not trust spoofed leftmost XFF by default", () => {
    const ip = extractClientIp({
      remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "evil.example, 10.0.0.1" },
      trustProxy: false,
    });
    expect(ip).toBe("10.0.0.1");
  });
});

describe("CIDR", () => {
  it("matches IPv4 CIDR", () => {
    expect(matchesCidr("192.0.2.10", "192.0.2.0/24")).toBe(true);
    expect(matchesCidr("198.51.100.1", "192.0.2.0/24")).toBe(false);
  });

  it("matches exact IP as /32", () => {
    const matcher = new CidrMatcher(["203.0.113.9"]);
    expect(matcher.contains("203.0.113.9")).toBe(true);
    expect(matcher.contains("203.0.113.10")).toBe(false);
  });

  it("matches IPv6 CIDR", () => {
    expect(matchesCidr("2001:db8::1", "2001:db8::/32")).toBe(true);
  });
});
