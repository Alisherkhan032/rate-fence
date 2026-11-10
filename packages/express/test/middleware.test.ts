import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createRateFence, type RateFence } from "rate-fence";
import { rateFenceExpress } from "../src/middleware.js";

describe("rateFenceExpress", () => {
  let fence: RateFence;

  afterEach(async () => {
    await fence?.close();
  });

  it("allows requests under the limit", async () => {
    fence = createRateFence({
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 5 },
      storeConfig: { cleanupIntervalMs: 0 },
    });
    const app = express();
    app.use(rateFenceExpress(fence));
    app.get("/api/users", (_req, res) => {
      res.json({ message: "Request allowed" });
    });

    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe("5");
  });

  it("returns 429 when rate limited", async () => {
    fence = createRateFence({
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 1 },
      storeConfig: { cleanupIntervalMs: 0 },
    });
    const app = express();
    app.use(rateFenceExpress(fence));
    app.get("/", (_req, res) => res.send("ok"));

    await request(app).get("/");
    const res = await request(app).get("/");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.body.reason).toBe("rate_limit_exceeded");
  });

  it("supports custom onBlocked", async () => {
    fence = createRateFence({
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 1 },
      storeConfig: { cleanupIntervalMs: 0 },
    });
    const app = express();
    app.use(
      rateFenceExpress(fence, {
        onBlocked: (_req, res) => {
          res.status(429).json({ error: "slow down" });
        },
      }),
    );
    app.get("/", (_req, res) => res.send("ok"));

    await request(app).get("/");
    const res = await request(app).get("/");
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("slow down");
  });

  it("enforces route-specific policies", async () => {
    fence = createRateFence({
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 100 },
      storeConfig: { cleanupIntervalMs: 0 },
    });
    fence.addPolicy({
      name: "login",
      match: { path: "/api/auth/login", methods: ["POST"] },
      rateLimit: { algorithm: "fixed-window", windowMs: 60_000, maxRequests: 1 },
    });

    const app = express();
    app.use(rateFenceExpress(fence));
    app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));

    await request(app).post("/api/auth/login");
    const res = await request(app).post("/api/auth/login");
    expect(res.status).toBe(429);
  });

  it("rejects oversized Content-Length", async () => {
    fence = createRateFence({
      maxRequestBytes: 10,
      storeConfig: { cleanupIntervalMs: 0 },
    });
    const app = express();
    app.use(rateFenceExpress(fence));
    app.post("/upload", (_req, res) => res.send("ok"));

    const res = await request(app)
      .post("/upload")
      .set("Content-Length", "100")
      .send("x".repeat(100));
    expect(res.status).toBe(413);
  });

  it("releases concurrency on finish", async () => {
    fence = createRateFence({
      concurrency: { perClient: 1 },
      storeConfig: { cleanupIntervalMs: 0 },
    });
    const app = express();
    app.use(rateFenceExpress(fence));
    app.get("/", (_req, res) => res.send("ok"));

    const first = await request(app).get("/");
    expect(first.status).toBe(200);
    const second = await request(app).get("/");
    expect(second.status).toBe(200);
  });
});
