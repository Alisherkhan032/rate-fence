import { createHash } from "node:crypto";
import type { FingerprintConfig } from "../types/config.js";
import type { RequestContext } from "../types/context.js";

/**
 * Lightweight heuristic fingerprint. Not a reliable identity proof.
 * Avoids high-cardinality arbitrary headers by default.
 */
export function buildFingerprint(
  context: Pick<RequestContext, "ip" | "headers" | "userAgent">,
  config: FingerprintConfig,
): string {
  const parts: string[] = [context.ip];

  if (config.includeUserAgent !== false) {
    parts.push(context.userAgent ?? context.headers["user-agent"] ?? "");
  }

  if (config.includeAcceptLanguage) {
    parts.push(context.headers["accept-language"] ?? "");
  }

  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}
