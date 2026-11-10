import { randomUUID } from "node:crypto";
import { extractClientIp } from "../ip/extract.js";
import type { TrustProxyConfig, FingerprintConfig } from "../types/config.js";
import type { BuildContextInput, RequestContext } from "../types/context.js";
import { buildFingerprint } from "../fingerprint/fingerprint.js";

function flattenHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = Object.create(null);
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (Array.isArray(value)) {
      out[lower] = value.join(", ");
    } else {
      out[lower] = value;
    }
  }
  return out;
}

function pathnameOnly(path: string): string {
  const q = path.indexOf("?");
  const hash = path.indexOf("#");
  let end = path.length;
  if (q !== -1) {
    end = Math.min(end, q);
  }
  if (hash !== -1) {
    end = Math.min(end, hash);
  }
  const result = path.slice(0, end);
  return result.length > 0 ? result : "/";
}

export function buildRequestContext(
  input: BuildContextInput,
  options: {
    trustProxy?: TrustProxyConfig;
    fingerprint?: FingerprintConfig;
  } = {},
): RequestContext {
  const headers = flattenHeaders(input.headers);
  const ip = extractClientIp({
    remoteAddress: input.remoteAddress,
    headers: input.headers,
    trustProxy: options.trustProxy,
  });

  const context: RequestContext = {
    requestId: input.requestId ?? randomUUID(),
    ip,
    method: input.method.toUpperCase(),
    path: pathnameOnly(input.path),
    timestamp: input.timestamp ?? Date.now(),
    headers,
  };

  if (headers["user-agent"]) {
    context.userAgent = headers["user-agent"];
  }
  if (input.contentLength !== undefined) {
    context.contentLength = input.contentLength;
  }
  if (input.user) {
    context.user = input.user;
  }
  if (input.apiKey) {
    context.apiKey = input.apiKey;
  }
  if (input.routeId) {
    context.routeId = input.routeId;
  }

  if (options.fingerprint?.enabled) {
    context.fingerprint = buildFingerprint(context, options.fingerprint);
  }

  return context;
}
