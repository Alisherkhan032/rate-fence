import { isIP } from "node:net";
import { normalizeIp } from "./normalize.js";

interface ParsedCidr {
  version: 4 | 6;
  network: bigint;
  mask: bigint;
}

function ipv4ToBigInt(ip: string): bigint {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return (
    (BigInt(parts[0]!) << 24n) |
    (BigInt(parts[1]!) << 16n) |
    (BigInt(parts[2]!) << 8n) |
    BigInt(parts[3]!)
  );
}

function ipv6ToBigInt(ip: string): bigint {
  // Expand :: notation
  const halves = ip.split("::");
  let groups: string[];
  if (halves.length === 1) {
    groups = ip.split(":");
  } else if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - (left.length + right.length);
    groups = [...left, ...Array(Math.max(missing, 0)).fill("0"), ...right];
  } else {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  if (groups.length !== 8) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  let result = 0n;
  for (const group of groups) {
    const n = Number.parseInt(group || "0", 16);
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) {
      throw new Error(`Invalid IPv6 address: ${ip}`);
    }
    result = (result << 16n) | BigInt(n);
  }
  return result;
}

function ipToBigInt(ip: string, version: 4 | 6): bigint {
  return version === 4 ? ipv4ToBigInt(ip) : ipv6ToBigInt(ip);
}

function parseCidr(cidr: string): ParsedCidr {
  const trimmed = cidr.trim();
  const [rawIp, rawPrefix] = trimmed.split("/");
  const ip = normalizeIp(rawIp);
  if (!ip) {
    throw new Error(`Invalid CIDR: ${cidr}`);
  }
  const version = isIP(ip) as 4 | 6;
  const maxPrefix = version === 4 ? 32 : 128;
  const prefix =
    rawPrefix === undefined || rawPrefix === ""
      ? maxPrefix
      : Number.parseInt(rawPrefix, 10);

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`);
  }

  const host = ipToBigInt(ip, version);
  const bits = BigInt(maxPrefix);
  const mask =
    prefix === 0
      ? 0n
      : ((1n << bits) - 1n) ^ ((1n << BigInt(maxPrefix - prefix)) - 1n);
  const network = host & mask;

  return { version, network, mask };
}

export class CidrMatcher {
  private readonly rules: ParsedCidr[];

  constructor(cidrs: string[]) {
    this.rules = cidrs.map((c) => parseCidr(c));
  }

  contains(ip: string): boolean {
    const normalized = normalizeIp(ip);
    if (!normalized) {
      return false;
    }
    const version = isIP(normalized);
    if (version !== 4 && version !== 6) {
      return false;
    }
    let host: bigint;
    try {
      host = ipToBigInt(normalized, version);
    } catch {
      return false;
    }

    for (const rule of this.rules) {
      if (rule.version !== version) {
        continue;
      }
      if ((host & rule.mask) === rule.network) {
        return true;
      }
    }
    return false;
  }

  get size(): number {
    return this.rules.length;
  }
}

export function matchesCidr(ip: string, cidr: string): boolean {
  return new CidrMatcher([cidr]).contains(ip);
}
