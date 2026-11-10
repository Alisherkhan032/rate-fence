import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { MemoryStateStore } from "../src/storage/memory-store.js";

describe("MemoryStateStore", () => {
  it("stores and retrieves values", () => {
    const store = new MemoryStateStore({ cleanupIntervalMs: 0 });
    store.set("a", 1);
    expect(store.get<number>("a")).toBe(1);
    store.close();
  });

  it("expires entries by TTL using injectable clock", () => {
    const clock = new FakeClock(1_000);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    store.set("a", "x", 500);
    expect(store.get("a")).toBe("x");
    clock.advance(501);
    expect(store.get("a")).toBeUndefined();
    store.close();
  });

  it("increments counters", () => {
    const store = new MemoryStateStore({ cleanupIntervalMs: 0 });
    expect(store.increment("c")).toBe(1);
    expect(store.increment("c", 2)).toBe(3);
    store.close();
  });

  it("evicts when maxEntries is exceeded", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ maxEntries: 2, cleanupIntervalMs: 0, clock });
    store.set("a", 1);
    clock.advance(1);
    store.set("b", 2);
    clock.advance(1);
    store.set("c", 3);
    expect(store.getStats().evicted).toBeGreaterThanOrEqual(1);
    expect(store.size()).toBeLessThanOrEqual(2);
    store.close();
  });

  it("throws after close", () => {
    const store = new MemoryStateStore({ cleanupIntervalMs: 0 });
    store.close();
    expect(() => store.set("a", 1)).toThrow(/closed/);
  });
});
