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
  trustProxy: false,
  threatDetection: {
    enabled: true,
    rules: {
      failedAuthentication: {
        enabled: true,
        threshold: 5,
        windowMs: 300_000,
        blockTtlMs: 60_000,
      },
    },
  },
  concurrency: {
    perClient: 20,
  },
});

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

fence.on("request.blocked", (event) => {
  console.warn("[rate-fence]", event.reason, event.ip, event.path);
});

app.use(express.json({ limit: "100kb" }));
app.use(rateFenceExpress(fence));

app.get("/api/users", (_req, res) => {
  res.json({ message: "Request allowed" });
});

app.post("/api/auth/login", (req, res) => {
  const { password } = req.body as { password?: string };
  if (password !== "secret") {
    fence.reportSignal({
      type: "authentication.failure",
      key: req.ip ?? "unknown",
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  res.json({ ok: true });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, stats: fence.getStats() });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`RateFence example listening on http://localhost:${port}`);
});

process.on("SIGINT", () => {
  void fence.close().then(() => process.exit(0));
});
