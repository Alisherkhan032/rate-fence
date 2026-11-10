import type { Clock } from "../clock/types.js";
import { systemClock } from "../clock/system-clock.js";
import type { StoreStats } from "../types/stats.js";
import type { StateStore } from "./types.js";

interface Entry {
  value: unknown;
  expiresAt?: number;
  createdAt: number;
  lastAccessAt: number;
}

export interface MemoryStateStoreOptions {
  maxEntries?: number;
  cleanupIntervalMs?: number;
  clock?: Clock;
}

const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 1_000;

/**
 * In-memory TTL store with bounded growth.
 *
 * IMPORTANT: Process-local only. Not suitable for distributed rate limiting
 * across multiple Node.js processes or hosts.
 */
export class MemoryStateStore implements StateStore {
  private readonly map = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly clock: Clock;
  private readonly cleanupIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private expiredSwept = 0;
  private evicted = 0;
  private closed = false;

  constructor(options: MemoryStateStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.clock = options.clock ?? systemClock;

    if (this.cleanupIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.cleanup();
      }, this.cleanupIntervalMs);
      // Do not keep the process alive solely for cleanup.
      if (typeof this.timer.unref === "function") {
        this.timer.unref();
      }
    }
  }

  get<T>(key: string): T | undefined {
    this.assertOpen();
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.expiredSwept += 1;
      return undefined;
    }
    entry.lastAccessAt = this.clock.now();
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.assertOpen();
    const now = this.clock.now();
    const existing = this.map.get(key);
    const entry: Entry = {
      value,
      createdAt: existing?.createdAt ?? now,
      lastAccessAt: now,
      expiresAt: ttlMs !== undefined && ttlMs > 0 ? now + ttlMs : undefined,
    };

    if (!existing && this.map.size >= this.maxEntries) {
      this.evictOne();
    }

    this.map.set(key, entry);
  }

  delete(key: string): void {
    this.assertOpen();
    this.map.delete(key);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  getOrSet<T>(key: string, factory: () => T, ttlMs?: number): T {
    const existing = this.get<T>(key);
    if (existing !== undefined) {
      return existing;
    }
    const value = factory();
    this.set(key, value, ttlMs);
    return value;
  }

  increment(key: string, by = 1, ttlMs?: number): number {
    const current = this.get<number>(key);
    const next = (typeof current === "number" ? current : 0) + by;
    this.set(key, next, ttlMs);
    return next;
  }

  size(): number {
    this.cleanup();
    return this.map.size;
  }

  cleanup(): number {
    if (this.closed) {
      return 0;
    }
    const now = this.clock.now();
    let removed = 0;
    for (const [key, entry] of this.map) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.map.delete(key);
        removed += 1;
      }
    }
    this.expiredSwept += removed;
    return removed;
  }

  getStats(): StoreStats {
    return {
      entryCount: this.map.size,
      maxEntries: this.maxEntries,
      expiredSwept: this.expiredSwept,
      evicted: this.evicted,
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.map.clear();
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= this.clock.now();
  }

  private evictOne(): void {
    const now = this.clock.now();
    let expiredKey: string | undefined;
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.map) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        expiredKey = key;
        break;
      }
      if (entry.lastAccessAt < oldestAccess) {
        oldestAccess = entry.lastAccessAt;
        oldestKey = key;
      }
    }

    const keyToRemove = expiredKey ?? oldestKey;
    if (keyToRemove) {
      this.map.delete(keyToRemove);
      this.evicted += 1;
      if (expiredKey) {
        this.expiredSwept += 1;
      }
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("MemoryStateStore has been closed");
    }
  }
}
