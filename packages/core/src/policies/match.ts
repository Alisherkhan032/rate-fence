import type { RequestContext } from "../types/context.js";
import type { Policy, PolicyMatch } from "../types/policy.js";

export function matchesPolicyMatch(context: RequestContext, match?: PolicyMatch): boolean {
  if (!match) {
    return true;
  }

  if (match.methods && match.methods.length > 0) {
    const methods = match.methods.map((m) => m.toUpperCase());
    if (!methods.includes(context.method)) {
      return false;
    }
  }

  if (match.path !== undefined && context.path !== match.path) {
    return false;
  }

  if (match.pathPrefix !== undefined && !context.path.startsWith(match.pathPrefix)) {
    return false;
  }

  if (match.pathRegex !== undefined && !match.pathRegex.test(context.path)) {
    return false;
  }

  return true;
}

export function policyApplies(policy: Policy, context: RequestContext): boolean {
  if (!matchesPolicyMatch(context, policy.match)) {
    return false;
  }
  if (policy.condition && !policy.condition(context)) {
    return false;
  }
  return true;
}

export function sortPoliciesByPriority(policies: Policy[]): Policy[] {
  return [...policies].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
