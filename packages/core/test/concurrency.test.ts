import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/system-clock.js";
import { ConcurrencyGuard } from "../src/protection/concurrency.js";
import { MemoryStateStore } from "../src/storage/memory-store.js";
import { createRateFence } from "../src/create-rate-fence.js";
import type { RequestContext } from "../src/types/context.js";

describe("ConcurrencyGuard", () => {
  it("acquires and releases per-client slots", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const guard = new ConcurrencyGuard({ perClient: 1 }, store, clock);

    const a = guard.acquire({ clientKey: "a" });
    expect(a.ok).toBe(true);
    const b = guard.acquire({ clientKey: "a" });
    expect(b.ok).toBe(false);
    if (a.ok) a.ticket.release();
    const c = guard.acquire({ clientKey: "a" });
    expect(c.ok).toBe(true);
    if (c.ok) c.ticket.release();
    store.close();
  });

  it("isolates clients", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const guard = new ConcurrencyGuard({ perClient: 1 }, store, clock);
    expect(guard.acquire({ clientKey: "a" }).ok).toBe(true);
    expect(guard.acquire({ clientKey: "b" }).ok).toBe(true);
    store.close();
  });

  it("does not leak on double release", () => {
    const clock = new FakeClock(0);
    const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });
    const guard = new ConcurrencyGuard({ global: 1 }, store, clock);
    const a = guard.acquire({ clientKey: "a" });
    expect(a.ok).toBe(true);
    if (a.ok) {
      a.ticket.release();
      a.ticket.release();
    }
    expect(guard.activeGlobal).toBe(0);
    expect(guard.acquire({ clientKey: "a" }).ok).toBe(true);
    store.close();
  });
});

describe("concurrency via fence", () => {
  it("rejects when per-client concurrency exceeded", async () => {
    const fence = createRateFence({
      clock: new FakeClock(0),
      storeConfig: { cleanupIntervalMs: 0 },
      concurrency: { perClient: 1 },
    });

    const ctx: RequestContext = {
      requestId: "1",
      ip: "203.0.113.1",
      method: "GET",
      path: "/",
      timestamp: 0,
      headers: {},
    };

    const first = await fence.evaluate(ctx);
    expect(first.allowed).toBe(true);
    const second = await fence.evaluate(ctx);
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("concurrency_limit_exceeded");
    first.concurrencyTicket?.release();
    const third = await fence.evaluate(ctx);
    expect(third.allowed).toBe(true);
    third.concurrencyTicket?.release();
    await fence.close();
  });
});
