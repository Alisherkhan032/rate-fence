import { isIP } from "node:net";

/**
 * Normalize IPv4 / IPv6 addresses.
 * - Trims whitespace
 * - Lowercases IPv6
 * - Converts IPv4-mapped IPv6 (:ffff:x.x.x.x) to IPv4
 * - Strips zone identifiers (%eth0)
 */
export function normalizeIp(raw: string | undefined | null): string | undefined {
  if (raw == null) {
    return undefined;
  }

  let value = raw.trim();
  if (!value) {
    return undefined;
  }

  // Strip brackets around IPv6 literals: [::1]
  if (value.startsWith("[") && value.includes("]")) {
    value = value.slice(1, value.indexOf("]"));
  }

  // Strip port from IPv4 host:port (not IPv6)
  if (value.includes(".") && value.includes(":") && !value.includes("::")) {
    const maybePort = value.lastIndexOf(":");
    const host = value.slice(0, maybePort);
    if (isIP(host) === 4) {
      value = host;
    }
  }

  // Strip IPv6 zone id
  const zoneIndex = value.indexOf("%");
  if (zoneIndex !== -1) {
    value = value.slice(0, zoneIndex);
  }

  value = value.toLowerCase();

  // IPv4-mapped IPv6
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) {
    value = mapped[1];
  }

  const version = isIP(value);
  if (version === 0) {
    return undefined;
  }

  return value;
}

export function isValidIp(value: string): boolean {
  return isIP(value) !== 0;
}
