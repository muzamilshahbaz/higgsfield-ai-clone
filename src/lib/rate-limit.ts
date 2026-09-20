import 'server-only'

/**
 * A fixed-window rate limiter.
 *
 * In memory, and honest about it: each serverless instance keeps its own
 * counters, so the real ceiling is roughly `limit × instances`, and a cold
 * start forgets everything. That is not a distributed limiter and it is not
 * pretending to be one — it is a brake on the accidental hot loop and the
 * casual script, which is what an unauthenticated endpoint actually meets.
 *
 * The rules that must hold no matter what — a user cannot overspend credits,
 * cannot run more than two jobs at once, cannot write outside their own
 * storage folder — live in Postgres and in RLS, where a forgetful instance
 * cannot weaken them. This file never guards money.
 *
 * Swapping in Upstash or Vercel KV later means replacing `consume` and
 * nothing else; every caller goes through `rateLimit`.
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  /** Epoch ms when the current window rolls over. */
  resetAt: number
  /** Whole seconds to wait, for a Retry-After header or a message. */
  retryAfterSec: number
}

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/**
 * Dropping expired entries costs one pass over the map, so it runs only when
 * the map has grown enough to be worth it. Without this a long-lived instance
 * accumulates a key per visitor forever.
 */
const PRUNE_THRESHOLD = 5_000

function prune(now: number): void {
  if (windows.size < PRUNE_THRESHOLD) return
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export function rateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  prune(now)

  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + rule.windowMs
    windows.set(key, { count: 1, resetAt })
    return {
      ok: true,
      limit: rule.limit,
      remaining: rule.limit - 1,
      resetAt,
      retryAfterSec: Math.ceil(rule.windowMs / 1000),
    }
  }

  existing.count += 1

  const remaining = Math.max(0, rule.limit - existing.count)
  return {
    ok: existing.count <= rule.limit,
    limit: rule.limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/** Test seam. Never called by application code. */
export function resetRateLimits(): void {
  windows.clear()
}

/**
 * Who to count against.
 *
 * A user id when we have one, because that is the thing a limit should follow
 * across devices. Otherwise the client IP from the proxy chain — spoofable in
 * general, but on Vercel `x-forwarded-for`'s first entry is set by the edge
 * and is the best signal available to a route handler.
 */
export function clientKey(request: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`

  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')

  return `ip:${ip || 'unknown'}`
}

/** A 429 body and headers shaped the same way every route reports one. */
export function tooManyRequests(result: RateLimitResult, message: string): Response {
  return Response.json(
    { error: { code: 'RATE_LIMITED', message, retryAfterSec: result.retryAfterSec } },
    {
      status: 429,
      headers: {
        'retry-after': String(result.retryAfterSec),
        'x-ratelimit-limit': String(result.limit),
        'x-ratelimit-remaining': String(result.remaining),
        'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
      },
    },
  )
}

/**
 * The same key, for a Server Action.
 *
 * An action has no `Request` to read, so the proxy headers come from
 * `next/headers` instead. Everything else — what a key means, how it falls
 * back to an IP — is identical to `clientKey`, and the two must stay that way
 * or a caller could dodge a limit by switching which door they knock on.
 */
export async function actionKey(userId?: string | null): Promise<string> {
  if (userId) return `user:${userId}`

  const { headers } = await import('next/headers')
  const headerList = await headers()

  const forwarded = headerList.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip')

  return `ip:${ip || 'unknown'}`
}
