import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { createSlidingWindowLimiter } from "../src/rate-limit/sliding-window.js";
import { MemoryStateStore } from "../src/storage/memory-store.js";

describe("sliding-window", () => {
  it("allows under the weighted limit", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createSlidingWindowLimiter(
      { windowMs: 10_000, maxRequests: 5 },
      { store, clock, stateKey: "rate:slide:test" },
    );

    for (let i = 0; i < 5; i += 1) {
      expect(limiter.consume("a").allowed).toBe(true);
    }
    expect(limiter.consume("a").allowed).toBe(false);
    store.close();
  });

  it("weights previous window at boundary", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createSlidingWindowLimiter(
      { windowMs: 10_000, maxRequests: 10 },
      { store, clock, stateKey: "rate:slide:boundary" },
    );

    for (let i = 0; i < 10; i += 1) {
      limiter.consume("a");
    }
    expect(limiter.consume("a").allowed).toBe(false);

    // Exactly at next window start, previous window still weighs 1.0 → still blocked
    clock.advance(10_000);
    expect(limiter.consume("a").allowed).toBe(false);

    // Further into the window, previous weight drops enough to allow
    clock.advance(5_000);
    const mid = limiter.consume("a");
    expect(mid.allowed).toBe(true);

    store.close();
  });

  it("fully resets after two windows", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createSlidingWindowLimiter(
      { windowMs: 1_000, maxRequests: 2 },
      { store, clock, stateKey: "rate:slide:reset" },
    );
    limiter.consume("a");
    limiter.consume("a");
    expect(limiter.consume("a").allowed).toBe(false);
    clock.advance(2_000);
    expect(limiter.consume("a").allowed).toBe(true);
    store.close();
  });
});
