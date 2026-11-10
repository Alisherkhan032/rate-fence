import type { StoreStats } from "../types/stats.js";

/**
 * Pluggable process-local state store.
 *
 * The default MemoryStateStore is NOT distributed. Multiple Node processes
 * do not share counters or threat state.
 */
export interface StateStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  has(key: string): boolean;
  /**
   * Atomically get-or-create and return the value.
   */
  getOrSet<T>(key: string, factory: () => T, ttlMs?: number): T;
  increment(key: string, by?: number, ttlMs?: number): number;
  /** Number of live (non-expired) entries. */
  size(): number;
  cleanup(): number;
  getStats(): StoreStats;
  close(): void;
}
