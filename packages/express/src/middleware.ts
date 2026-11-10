import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { KeyGenerator, RateFence, SecurityDecision } from "rate-fence";

export interface RateFenceExpressOptions {
  onBlocked?: (req: Request, res: Response, decision: SecurityDecision) => void;
  getUser?: (req: Request) => { id: string } | undefined;
  getApiKey?: (req: Request) => string | undefined;
  keyGenerator?: KeyGenerator;
  /**
   * Soft request timeout. Clears the timer on response finish/close.
   * Does not cancel arbitrary application work that cannot be cancelled.
   */
  timeoutMs?: number;
  /**
   * When true (default), report response status codes back to the fence for threat rules.
   */
  reportResponseStatus?: boolean;
}

function setRateLimitHeaders(res: Response, decision: SecurityDecision): void {
  if (!decision.rateLimit) {
    return;
  }
  const { limit, remaining, resetAt } = decision.rateLimit;
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  const resetSec = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader("RateLimit-Reset", String(resetSec));
}

function defaultBlocked(res: Response, decision: SecurityDecision): void {
  if (res.headersSent) {
    return;
  }
  if (decision.retryAfterMs !== undefined) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))));
  }
  setRateLimitHeaders(res, decision);
  const status = decision.statusCode ?? (decision.reason === "rate_limit_exceeded" ? 429 : 403);
  res.status(status).json({
    error: decision.reason === "rate_limit_exceeded" ? "Too many requests" : "Forbidden",
    reason: decision.reason,
  });
}

type ResEnd = Response["end"];

/**
 * Express middleware for RateFence.
 *
 * Place early in the middleware stack, before expensive body parsers when
 * enforcing maxRequestBytes via Content-Length. For chunked bodies, Content-Length
 * may be absent — pair with framework body limits.
 */
export function rateFenceExpress(
  fence: RateFence,
  options: RateFenceExpressOptions = {},
): RequestHandler {
  const reportResponseStatus = options.reportResponseStatus ?? true;

  return function rateFenceMiddleware(req: Request, res: Response, next: NextFunction): void {
    void (async () => {
      let ticketRelease: (() => void) | undefined;
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const releaseOnce = (): void => {
        if (!ticketRelease) {
          return;
        }
        const release = ticketRelease;
        ticketRelease = undefined;
        release();
      };

      const cleanup = (): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
        releaseOnce();
      };

      res.on("finish", cleanup);
      res.on("close", cleanup);
      req.on("aborted", cleanup);

      try {
        const contentLengthHeader = req.headers["content-length"];
        const contentLength =
          typeof contentLengthHeader === "string"
            ? Number.parseInt(contentLengthHeader, 10)
            : undefined;

        const context = fence.buildContext({
          method: req.method,
          path: req.path || req.url,
          headers: req.headers as Record<string, string | string[] | undefined>,
          remoteAddress: req.socket.remoteAddress,
          contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
          user: options.getUser?.(req),
          apiKey: options.getApiKey?.(req),
        });

        const decision = await fence.evaluate(context, {
          keyGenerator: options.keyGenerator,
        });

        if (!decision.allowed) {
          const key = options.keyGenerator?.(context) ?? context.user?.id ?? context.ip;
          fence.reportSignal({ type: "request.blocked", key });
          if (options.onBlocked) {
            options.onBlocked(req, res, decision);
          } else {
            defaultBlocked(res, decision);
          }
          return;
        }

        ticketRelease = decision.concurrencyTicket?.release;

        if (decision.rateLimit) {
          setRateLimitHeaders(res, decision);
        }

        if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
          timeoutHandle = setTimeout(() => {
            if (settled || res.headersSent) {
              return;
            }
            settled = true;
            cleanup();
            res.status(503).json({ error: "Request timeout" });
          }, options.timeoutMs);
          if (typeof timeoutHandle.unref === "function") {
            timeoutHandle.unref();
          }
        }

        if (reportResponseStatus) {
          const originalEnd: ResEnd = res.end.bind(res);
          const patchedEnd: ResEnd = function patched(
            this: Response,
            ...args: Parameters<ResEnd>
          ) {
            settled = true;
            const key = options.keyGenerator?.(context) ?? context.user?.id ?? context.ip;
            fence.reportSignal({
              type: "response.status",
              key,
              status: res.statusCode,
              path: context.path,
            });
            return originalEnd(...args);
          } as ResEnd;
          res.end = patchedEnd;
        }

        next();
      } catch (err) {
        cleanup();
        next(err);
      }
    })();
  };
}
