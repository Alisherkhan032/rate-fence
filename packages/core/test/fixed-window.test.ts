import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { createFixedWindowLimiter } from "../src/rate-limit/fixed-window.js";
import { MemoryStateStore } from "../src/storage/memory-store.js";

function setup() {
  const clock = new FakeClock(1_000_000);
  const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
  const limiter = createFixedWindowLimiter(
    { windowMs: 60_000, maxRequests: 3 },
    { store, clock, stateKey: "rate:fixed:test" },
  );
  return { clock, store, limiter };
}

describe("fixed-window", () => {
  it("allows first request", () => {
    const { limiter, store } = setup();
    const r = limiter.consume("a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
    store.close();
  });

  it("allows requests below limit", () => {
    const { limiter, store } = setup();
    limiter.consume("a");
    const r = limiter.consume("a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
    store.close();
  });

  it("allows request at limit", () => {
    const { limiter, store } = setup();
    limiter.consume("a");
    limiter.consume("a");
    const r = limiter.consume("a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
    store.close();
  });

  it("blocks request exceeding limit", () => {
    const { limiter, store } = setup();
    limiter.consume("a");
    limiter.consume("a");
    limiter.consume("a");
    const r = limiter.consume("a");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    store.close();
  });

  it("resets after window expiration", () => {
    const { clock, limiter, store } = setup();
    limiter.consume("a");
    limiter.consume("a");
    limiter.consume("a");
    expect(limiter.consume("a").allowed).toBe(false);
    clock.advance(60_000);
    const r = limiter.consume("a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
    store.close();
  });

  it("isolates clients", () => {
    const { limiter, store } = setup();
    limiter.consume("a");
    limiter.consume("a");
    limiter.consume("a");
    expect(limiter.consume("b").allowed).toBe(true);
    store.close();
  });
});
