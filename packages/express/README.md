# @rate-fence/express

Express middleware for [RateFence](https://www.npmjs.com/package/rate-fence).

Maps Express `req` / `res` to the framework-neutral core: builds request context, calls `evaluate()`, sets rate-limit headers, returns 429/403/413 when blocked, and releases concurrency slots on response finish/close/abort.

**Core docs:** [rate-fence on npm](https://www.npmjs.com/package/rate-fence)  
**Source:** [github.com/Alisherkhan032/rate-fence](https://github.com/Alisherkhan032/rate-fence)

## Installation

```bash
npm install rate-fence @rate-fence/express express
```

Peer dependencies: `express`, `rate-fence`.

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

## Options

```ts
app.use(
  rateFenceExpress(fence, {
    onBlocked: (req, res, decision) => {
      res.status(decision.statusCode ?? 429).json({
        error: "Too many requests",
        reason: decision.reason,
      });
    },
    getUser: (req) => (req as { user?: { id: string } }).user,
    getApiKey: (req) => req.header("x-api-key") ?? undefined,
    keyGenerator: (ctx) => ctx.user?.id ?? ctx.apiKey ?? ctx.ip,
    timeoutMs: 30_000, // soft timeout; does not cancel arbitrary app work
    reportResponseStatus: true, // feed status codes into threat detection
  }),
);
```

## Middleware ordering

Place RateFence **early** in the stack.

- For `maxRequestBytes`, prefer before heavy body parsers when possible (`Content-Length` is checked when present).
- Chunked bodies without `Content-Length` still need framework body limits (e.g. `express.json({ limit: "1mb" })`).

## Response headers

When a rate-limit decision includes limit metadata:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset` (delta seconds)
- `Retry-After` (on 429)

## Status codes

| Reason | Typical status |
|---|---|
| `rate_limit_exceeded` | 429 |
| `concurrency_limit_exceeded` | 429 |
| `ip_blocked` / `policy_denied` / `client_blocked` | 403 |
| `request_too_large` | 413 |
| Soft timeout (`timeoutMs`) | 503 |

## License

MIT
