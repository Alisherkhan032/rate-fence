/**
 * Microbenchmarks for RateFence core paths.
 *
 * Run: pnpm bench
 * Results depend on machine and Node version — do not invent numbers in docs.
 */
import { performance } from "node:perf_hooks";
import {
  createRateFence,
  createFixedWindowLimiter,
  createSlidingWindowLimiter,
  createTokenBucketLimiter,
  MemoryStateStore,
  FakeClock,
  CidrMatcher,
} from "rate-fence";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

async function bench(name: string, iterations: number, fn: () => void | Promise<void>): Promise<void> {
  const samples: number[] = [];
  // warmup
  for (let i = 0; i < Math.min(1_000, iterations); i += 1) {
    await fn();
  }
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const total = samples.reduce((a, b) => a + b, 0);
  const avg = total / samples.length;
  const rps = 1000 / avg;
  // eslint-disable-next-line no-console
  console.log(
    `${name.padEnd(36)} avg=${avg.toFixed(4)}ms  p95=${percentile(samples, 95).toFixed(4)}ms  p99=${percentile(samples, 99).toFixed(4)}ms  ~${Math.round(rps).toLocaleString()} ops/s`,
  );
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Node ${process.version}`);
  // eslint-disable-next-line no-console
  console.log(`Platform ${process.platform} ${process.arch}`);
  // eslint-disable-next-line no-console
  console.log("---");

  const clock = new FakeClock(0);
  const store = new MemoryStateStore({ cleanupIntervalMs: 0, clock });

  const fixed = createFixedWindowLimiter(
    { windowMs: 60_000, maxRequests: 1_000_000 },
    { store, clock, stateKey: "bench:fixed" },
  );
  const sliding = createSlidingWindowLimiter(
    { windowMs: 60_000, maxRequests: 1_000_000 },
    { store, clock, stateKey: "bench:slide" },
  );
  const bucket = createTokenBucketLimiter(
    { capacity: 1_000_000, refillRate: 1_000_000 },
    { store, clock, stateKey: "bench:tb" },
  );

  await bench("fixed-window", 50_000, () => {
    fixed.consume("client");
  });
  await bench("sliding-window", 50_000, () => {
    sliding.consume("client");
  });
  await bench("token-bucket", 50_000, () => {
    bucket.consume("client");
  });

  const matcher = new CidrMatcher(["10.0.0.0/8", "192.168.0.0/16", "2001:db8::/32"]);
  await bench("cidr-match", 100_000, () => {
    matcher.contains("10.1.2.3");
  });

  const fence = createRateFence({
    rateLimit: { algorithm: "sliding-window", windowMs: 60_000, maxRequests: 10_000_000 },
    concurrency: { perClient: 10_000 },
    threatDetection: { enabled: true },
    storeConfig: { cleanupIntervalMs: 0 },
    clock,
  });

  let i = 0;
  await bench("full-evaluate", 20_000, async () => {
    i += 1;
    const decision = await fence.evaluate({
      requestId: String(i),
      ip: "203.0.113.10",
      method: "GET",
      path: "/api/users",
      timestamp: clock.now(),
      headers: {},
    });
    decision.concurrencyTicket?.release();
  });

  store.close();
  await fence.close();
}

void main();
