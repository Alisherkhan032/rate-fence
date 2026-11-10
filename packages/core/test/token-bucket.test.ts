import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { createTokenBucketLimiter } from "../src/rate-limit/token-bucket.js";
import { MemoryStateStore } from "../src/storage/memory-store.js";

describe("token-bucket", () => {
  it("starts at capacity", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createTokenBucketLimiter(
      { capacity: 5, refillRate: 1 },
      { store, clock, stateKey: "rate:tb:test" },
    );
    const r = limiter.consume("a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    store.close();
  });

  it("consumes tokens until empty", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createTokenBucketLimiter(
      { capacity: 2, refillRate: 1 },
      { store, clock, stateKey: "rate:tb:empty" },
    );
    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(true);
    const denied = limiter.consume("a");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    store.close();
  });

  it("refills based on elapsed time", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createTokenBucketLimiter(
      { capacity: 2, refillRate: 2 },
      { store, clock, stateKey: "rate:tb:refill" },
    );
    limiter.consume("a");
    limiter.consume("a");
    expect(limiter.consume("a").allowed).toBe(false);
    clock.advance(500); // 1 token at 2/sec
    expect(limiter.consume("a").allowed).toBe(true);
    store.close();
  });

  it("does not exceed capacity", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createTokenBucketLimiter(
      { capacity: 3, refillRate: 100 },
      { store, clock, stateKey: "rate:tb:cap" },
    );
    limiter.consume("a");
    clock.advance(60_000);
    const r = limiter.consume("a");
    expect(r.remaining).toBeLessThanOrEqual(2);
    store.close();
  });

  it("supports fractional refill", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const limiter = createTokenBucketLimiter(
      { capacity: 1, refillRate: 0.5 },
      { store, clock, stateKey: "rate:tb:frac" },
    );
    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(false);
    clock.advance(1_000); // 0.5 tokens
    expect(limiter.consume("a").allowed).toBe(false);
    clock.advance(1_000); // full token
    expect(limiter.consume("a").allowed).toBe(true);
    store.close();
  });
});
