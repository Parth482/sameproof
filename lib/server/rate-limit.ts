import "server-only";

import { AppError } from "@/lib/errors/app-error";

interface Bucket {
  count: number;
  resetAt: number;
}

declare global {
  var sameProofRateLimits: Map<string, Bucket> | undefined;
}

const buckets = globalThis.sameProofRateLimits ?? new Map<string, Bucket>();
globalThis.sameProofRateLimits = buckets;

/** Lightweight prototype protection. Production multi-instance hosting should
 * replace this process-local bucket with a shared limiter such as Redis. */
export function assertRateLimit(
  request: Request,
  scope: string,
  limit = 30,
  windowMs = 60_000,
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || request.headers.get("x-real-ip") || "local";
  const key = `${scope}:${client}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Wait a moment and try again.", 429, {
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    });
  }
  current.count += 1;
}
