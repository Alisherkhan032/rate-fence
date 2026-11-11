# RateFence

**RateFence** (`rate-fence`) is a production-oriented API protection engine for Node.js. It rate-limits traffic, evaluates request policies, detects suspicious patterns, and guards concurrency — with **zero mandatory infrastructure**.

Default state is **in-memory and process-local**. Multiple Node.js processes do **not** share counters. RateFence is application-layer protection, not a CDN, WAF, or network DDoS solution.

## Packages

| Package | Purpose |
|---|---|
| [`rate-fence`](./packages/core) | Framework-neutral core engine |
| [`@rate-fence/express`](./packages/express) | Express middleware adapter |

## Problems it solves

- Abusive or runaway clients exhausting API capacity
- Brute-force login attempts (with explicit auth signals)
- Per-route limits (e.g. stricter auth endpoints)
- IP allow/block lists with CIDR support
- Concurrent request storms from a single client
- Oversized request rejection (when size is observable)

## Installation

```bash
npm install rate-fence @rate-fence/express
# or
pnpm add rate-fence @rate-fence/express
```

Peer dependency: `express` (for the adapter only).

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

## Configuration reference

**Default rate limit:** if you omit `rateLimit`, RateFence applies **sliding-window, 100 requests / 60 seconds**. Pass `rateLimit: false` to disable global rate limiting.

```ts
const fence = createRateFence({
  // rateLimit omitted → sliding-window, 100 / 60s
  // rateLimit: false, // disable global rate limiting
  rateLimit: {
    algorithm: "sliding-window", // or "fixed-window" | "token-bucket"
    windowMs: 60_000,
    maxRequests: 100,
  },
  // token-bucket shape:
  // rateLimit: { algorithm: "token-bucket", capacity: 50, refillRate: 1 },

  trustProxy: false, // NEVER enable casually — prevents X-Forwarded-For spoofing
  // trustProxy: { hopCount: 1 }
  // trustProxy: { proxies: ["10.0.0.0/8"] }

  keyGenerator: (ctx) => ctx.user?.id ?? ctx.ip,

  fingerprint: { enabled: false },

  threatDetection: {
    enabled: false, // opt-in
  },

  concurrency: {
    global: 500,
    perClient: 10,
  },

  maxRequestBytes: 1_048_576,

  ipAccess: {
    allowlist: ["10.0.0.0/8"],      // bypasses IP deny only — rate limits still apply
    blocklist: ["192.0.2.10"],
  },

  storeConfig: {
    maxEntries: 100_000,
    cleanupIntervalMs: 1_000,
  },
});
```

## Rate-limiting algorithms

### Fixed window

Counts requests in discrete windows of `windowMs`. Simple and fast; can allow up to `2 × maxRequests` around a boundary.

### Sliding window (counter)

Memory-efficient weighted estimate using previous + current window counts. Avoids storing every timestamp. Small approximation error at edges by design.

### Token bucket

Clients hold up to `capacity` tokens, refilled at `refillRate` tokens/second. Smoothly absorbs bursts.

## Route-specific policies

```ts
fence.addPolicy({
  name: "login-protection",
  priority: 10, // higher runs first
  match: { path: "/api/auth/login", methods: ["POST"] },
  rateLimit: {
    algorithm: "fixed-window",
    windowMs: 60_000,
    maxRequests: 5,
  },
});
```

**Precedence**

1. Normalize request context
2. Manual / temporary client blocks
3. Explicit `action: "block"` policies
4. Explicit `action: "allow"` / IP allowlist — **only skips IP deny checks**
5. IP blocklist
6. Request size
7. Concurrency limits
8. Rate limits (route policy **replaces** global for that request)
9. Threat recording / temporary blocks for subsequent requests

## IP handling and trusted proxies

By default RateFence uses the **socket remote address** only.

Do not set `trustProxy: true` unless you are behind a reverse proxy you control. Spoofed `X-Forwarded-For` headers are ignored when trust is disabled.

## Threat detection

Parent switch is `threatDetection.enabled`. **Individual rules are opt-in**: a rule runs only if you list it under `rules`. Omitted rules (including `sensitiveEndpoint`) stay off — they are not auto-enabled with defaults.

```ts
threatDetection: {
  enabled: true,
  rules: {
    failedAuthentication: { threshold: 8, windowMs: 300_000, blockTtlMs: 60_000 },
    // sensitiveEndpoint: { threshold: 20, windowMs: 60_000 } // only if you opt in
  },
},
```

Report app-level events with signals:

```ts
fence.reportSignal({
  type: "authentication.failure",
  key: "user:123",
});
```

Supported signals: `authentication.failure`, `authentication.success`, `response.status`, `payload.oversized`, `request.blocked`.

`sensitivePaths` only applies when `sensitiveEndpoint` is enabled. Threat responses are temporary (TTL blocks / events). RateFence never permanently bans based on weak fingerprints.

## Concurrency protection

```ts
concurrency: {
  global: 500,
  perClient: 10,
  perRoute: 50,
}
```

The Express adapter releases slots on `finish`, `close`, and `aborted`.

## Express integration

```ts
import { rateFenceExpress } from "@rate-fence/express";

app.use(
  rateFenceExpress(fence, {
    onBlocked: (req, res, decision) => {
      res.status(429).json({ error: "Too many requests" });
    },
    getUser: (req) => (req as { user?: { id: string } }).user,
    timeoutMs: 30_000, // soft timeout; does not cancel arbitrary app work
  }),
);
```

**Middleware ordering:** place RateFence early. For size limits, prefer before body parsers; `Content-Length` is checked when present. Chunked uploads without Content-Length need framework body limits as well.

Response headers (when a rate-limit decision produced values):

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset` (delta seconds)
- `Retry-After` (on 429)

## Custom identity resolution

```ts
createRateFence({
  keyGenerator: (ctx) => ctx.apiKey ?? ctx.user?.id ?? ctx.ip,
});
```

## Events and observability

```ts
fence.on("request.blocked", (event) => {
  console.log(event.ip, event.reason, event.timestamp);
});

const stats = fence.getStats();
```

Events: `request.allowed`, `request.blocked`, `rate_limit.exceeded`, `threat.detected`, `client.blocked`, `policy.matched`, `concurrency.limit_exceeded`.

Listener failures (sync or async) never break the request path.

## Memory management

`MemoryStateStore` uses TTLs, periodic cleanup, and a `maxEntries` ceiling. It is **not distributed**.

```ts
await fence.close(); // clears timers and state
```

## Performance considerations

RateFence runs on every request. Prefer:

- Simple key generators
- Fingerprinting off unless needed
- Threat detection only when you will act on signals

Run `pnpm bench` locally and record Node version + machine. Do not rely on fabricated numbers.

## Limitations — when RateFence is not appropriate

- Multi-instance / multi-process shared limits (needs an external store; not in v1)
- Network-layer DDoS absorption
- Replacing a CDN, WAF, or API gateway
- Perfect identity from browser fingerprints
- Cancelling non-cancellable application work on timeout

## Examples

See [`examples/express-api`](./examples/express-api).

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm bench
```

## License

MIT
