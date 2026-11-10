import { validatePolicy } from "../config/validate.js";
import type { Policy } from "../types/policy.js";
import { sortPoliciesByPriority } from "./match.js";

export class PolicyRegistry {
  private policies = new Map<string, Policy>();

  constructor(initial: Policy[] = []) {
    for (const policy of initial) {
      this.add(policy);
    }
  }

  add(policy: Policy): void {
    validatePolicy(policy);
    if (this.policies.has(policy.name)) {
      throw new Error(`Policy already exists: ${policy.name}`);
    }
    this.policies.set(policy.name, policy);
  }

  remove(name: string): boolean {
    return this.policies.delete(name);
  }

  get(name: string): Policy | undefined {
    return this.policies.get(name);
  }

  list(): Policy[] {
    return sortPoliciesByPriority([...this.policies.values()]);
  }
}
