import { CidrMatcher } from "../ip/cidr.js";
import type { IpAccessConfig } from "../types/policy.js";

export interface IpAccessEvaluator {
  isBlocked(ip: string): boolean;
  isAllowlisted(ip: string): boolean;
}

export function createIpAccessEvaluator(config?: IpAccessConfig): IpAccessEvaluator {
  const allow = config?.allowlist?.length ? new CidrMatcher(config.allowlist) : undefined;
  const block = config?.blocklist?.length ? new CidrMatcher(config.blocklist) : undefined;

  return {
    isBlocked(ip: string): boolean {
      return block?.contains(ip) ?? false;
    },
    isAllowlisted(ip: string): boolean {
      return allow?.contains(ip) ?? false;
    },
  };
}
