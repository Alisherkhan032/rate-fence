# rate-fence

Production-oriented API protection for Node.js: rate limiting, request policies, threat signals, and concurrency guards — with **zero mandatory infrastructure**.

Default state is **in-memory and process-local**. Multiple Node.js processes do **not** share counters. RateFence is application-layer protection, not a CDN, WAF, or network DDoS solution.

**Related package:** [`@rate-fence/express`](https://www.npmjs.com/package/@rate-fence/express) — Express middleware adapter.

**Source:** [github.com/Alisherkhan032/rate-fence](https://github.com/Alisherkhan032/rate-fence)

## Installation

```bash
npm install rate-fence
# with Express:
npm install rate-fence @rate-fence/express express
```

## Quick start

```ts
import express from "express";
import { createRateFence } from "rate-fence";
import { rateFenceExpress } from "@rate-fence/express";

const app = express();

const fence = createRateFence({
  rateLimit: {
    algorithm: "sliding-window",
    windowMs: 60_000,
    maxRequests: 100,
  },
});

app.use(rateFenceExpress(fence));

app.get("/api/users", (_req, res) => {
  res.json({ message: "Request allowed" });
});

app.listen(3000);
```

Framework-neutral usage (no Express):

```ts
import { createRateFence } from "rate-fence";

const fence = createRateFence({
  rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 50 },
});

const context = fence.buildContext({
  method: "GET",
  path: "/api/users",
  headers: {},
  remoteAddress: "203.0.113.10",
});

const decision = await fence.evaluate(context);
if (!decision.allowed) {
  // map decision.statusCode / decision.reason yourself
}
```

## Configuration

**Default rate limit:** if `rateLimit` is omitted, RateFence uses **sliding-window, 100 requests / 60 seconds**. Use `rateLimit: false` to disable global rate limiting.

```ts
const fence = createRateFence({
  // rateLimit omitted → sliding-window, 100 / 60s
  // rateLimit: false, // disable global rate limiting
  rateLimit: {
    algorithm: "sliding-window", // or "fixed-window" | "token-bucket"
    windowMs: 60_000,
    maxRequests: 100,
  },
  // token-bucket:
  // rateLimit: { algorithm: "token-bucket", capacity: 50, refillRate: 1 },

  trustProxy: false, // do not enable casually — prevents X-Forwarded-For spoofing
  // trustProxy: { hopCount: 1 }
  // trustProxy: { proxies: ["10.0.0.0/8"] }

  keyGenerator: (ctx) => ctx.user?.id ?? ctx.ip,

  fingerprint: { enabled: false },

  threatDetection: { enabled: false },

  concurrency: {
    global: 500,
    perClient: 10,
  },

  maxRequestBytes: 1_048_576,

  ipAccess: {
    allowlist: ["10.0.0.0/8"], // bypasses IP deny only — rate limits still apply
    blocklist: ["192.0.2.10"],
  },

  storeConfig: {
    maxEntries: 100_000,
    cleanupIntervalMs: 1_000,
  },
});
```

## Rate-limiting algorithms

| Algorithm | Behavior |
|---|---|
| **fixed-window** | Count in discrete `windowMs` buckets. Simple; can burst at window edges. |
| **sliding-window** | Weighted previous + current window. Memory-efficient (no timestamp log). |
| **token-bucket** | Tokens refill at `refillRate` / second. Smooth bursts. |

## Route-specific policies

```ts
fence.addPolicy({
  name: "login-protection",
  priority: 10,
  match: { path: "/api/auth/login", methods: ["POST"] },
  rateLimit: {
    algorithm: "fixed-window",
    windowMs: 60_000,
    maxRequests: 5,
  },
});
```

Route rate limits **replace** the global limit for matching requests (they are not stacked).

### Evaluation order

1. Normalize request context  
2. Manual / temporary client blocks  
3. Explicit `action: "block"` policies  
4. `action: "allow"` / IP allowlist — **only skips IP deny checks**  
5. IP blocklist  
6. Request size  
7. Concurrency  
8. Rate limits  
9. Threat recording (blocks apply to later requests)

## IP handling and trusted proxies

By default RateFence uses the **socket remote address** only. Spoofed `X-Forwarded-For` is ignored unless you configure `trustProxy`.

## Threat detection

`threatDetection.enabled` turns the engine on. **Each rule must be listed** under `rules` to run; omitted rules stay off (no surprise `sensitiveEndpoint` blocks on `/login`).

```ts
threatDetection: {
  enabled: true,
  rules: {
    failedAuthentication: { threshold: 8, windowMs: 300_000, blockTtlMs: 60_000 },
  },
},
```

The library cannot invent auth outcomes — report them:

```ts
fence.reportSignal({
  type: "authentication.failure",
  key: "user:123",
});
```

Signals: `authentication.failure`, `authentication.success`, `response.status`, `payload.oversized`, `request.blocked`.

`sensitivePaths` applies only when `sensitiveEndpoint` is opted in. Responses are temporary (TTL blocks / events).

## Concurrency and size

```ts
concurrency: { global: 500, perClient: 10, perRoute: 50 }
maxRequestBytes: 1_048_576
```

## Manual blocks

```ts
fence.blockClient("203.0.113.10", { ttlMs: 60_000, reason: "abuse" });
fence.unblockClient("203.0.113.10");
```

## Events and stats

```ts
fence.on("request.blocked", (event) => {
  console.log(event.ip, event.reason, event.timestamp);
});

const stats = fence.getStats();
await fence.close();
```

Events: `request.allowed`, `request.blocked`, `rate_limit.exceeded`, `threat.detected`, `client.blocked`, `policy.matched`, `concurrency.limit_exceeded`.

Listener failures never break the request path.

## Limitations

- Not distributed across processes/hosts (v1 in-memory store)
- Not a network DDoS / CDN / WAF replacement
- Sliding window is an estimate
- Timeouts do not cancel arbitrary application work

## License

MIT
