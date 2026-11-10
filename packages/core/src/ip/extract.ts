import type { TrustProxyConfig } from "../types/config.js";
import { CidrMatcher } from "./cidr.js";
import { normalizeIp } from "./normalize.js";

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

function parseForwardedFor(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Extract client IP with explicit proxy trust semantics.
 *
 * When trustProxy is false/undefined, only the socket remote address is used.
 * Forwarded headers are ignored to prevent spoofing.
 */
export function extractClientIp(options: {
  remoteAddress?: string | null;
  headers: Record<string, string | string[] | undefined>;
  trustProxy?: TrustProxyConfig;
}): string {
  const socketIp = normalizeIp(options.remoteAddress ?? undefined) ?? "0.0.0.0";
  const trust = options.trustProxy;

  if (!trust) {
    return socketIp;
  }

  const xff = parseForwardedFor(headerValue(options.headers, "x-forwarded-for"));
  const xRealIp = normalizeIp(headerValue(options.headers, "x-real-ip"));

  if (trust === true) {
    // Trust one hop by default when boolean true.
    if (xff.length > 0) {
      const candidate = normalizeIp(xff[xff.length - 1]);
      if (candidate) {
        return candidate;
      }
    }
    if (xRealIp) {
      return xRealIp;
    }
    return socketIp;
  }

  const hopCount = trust.hopCount ?? 1;
  if (trust.proxies && trust.proxies.length > 0) {
    const trusted = new CidrMatcher(trust.proxies);
    // Walk from right; skip trusted proxies; first untrusted is client.
    const chain = [...xff].reverse();
    for (const entry of chain) {
      const ip = normalizeIp(entry);
      if (!ip) {
        continue;
      }
      if (!trusted.contains(ip)) {
        return ip;
      }
    }
    return socketIp;
  }

  if (xff.length >= hopCount) {
    const index = xff.length - hopCount;
    const candidate = normalizeIp(xff[index]);
    if (candidate) {
      return candidate;
    }
  }

  if (xRealIp) {
    return xRealIp;
  }

  return socketIp;
}
