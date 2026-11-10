/**
 * Normalized request context used by RateFence security policies.
 * Contains only fields needed for protection decisions — not full request bodies.
 */
export interface RequestContext {
  requestId: string;
  /** Normalized client IP (IPv4 or IPv6). */
  ip: string;
  method: string;
  /** Pathname only (no query string). */
  path: string;
  userAgent?: string;
  timestamp: number;
  headers: Readonly<Record<string, string | undefined>>;
  contentLength?: number;
  user?: { id: string };
  apiKey?: string;
  fingerprint?: string;
  routeId?: string;
}

export type KeyGenerator = (context: RequestContext) => string;

export interface BuildContextInput {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  remoteAddress?: string | null;
  contentLength?: number;
  user?: { id: string };
  apiKey?: string;
  routeId?: string;
  requestId?: string;
  timestamp?: number;
}
