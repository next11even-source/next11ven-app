import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

/**
 * Per-user rate limiting for cost-bearing / abuse-prone API routes.
 *
 * Backed by Upstash Redis (provisioned via the Vercel Marketplace). The env
 * vars are named with Vercel's KV infix, NOT the @upstash defaults, so we wire
 * the client explicitly rather than using Redis.fromEnv().
 *
 * FAIL-OPEN by design: if Upstash is not configured (e.g. local dev without the
 * env vars) or Redis errors at request time, every check passes. A limiter
 * outage must never take the app down for a solo build.
 */

const url = process.env.UPSTASH_REDIS_KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

if (!redis && process.env.NODE_ENV === 'production') {
  console.warn('[ratelimit] Upstash env vars missing in production — rate limiting is DISABLED (failing open).')
}

type LimitName =
  | 'messagesSend'
  | 'messagesInitiate'
  | 'applicationsApply'
  | 'stripeCheckout'
  | 'registerComplete'

// requests allowed per 60s sliding window, per user. Generous for real humans,
// tight enough to stop a runaway loop or scripted abuse.
const LIMITS: Record<LimitName, number> = {
  messagesSend: 20,
  messagesInitiate: 10,
  applicationsApply: 10,
  stripeCheckout: 10,
  registerComplete: 5,
}

const limiters: Record<LimitName, Ratelimit> | null = redis
  ? (Object.fromEntries(
      (Object.keys(LIMITS) as LimitName[]).map((name) => [
        name,
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(LIMITS[name], '60 s'),
          prefix: `rl:${name}`,
          analytics: false,
        }),
      ])
    ) as Record<LimitName, Ratelimit>)
  : null

/**
 * Enforce a per-user rate limit. Returns a 429 NextResponse if the caller is
 * over the limit, or null if the request should proceed.
 *
 * Usage (place immediately after the getUser() auth check):
 *   const limited = await enforceRateLimit('messagesSend', user.id)
 *   if (limited) return limited
 */
export async function enforceRateLimit(
  name: LimitName,
  identifier: string
): Promise<NextResponse | null> {
  if (!limiters) return null
  try {
    const { success, reset } = await limiters[name].limit(identifier)
    if (success) return null
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many requests. Please slow down and try again shortly.',
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  } catch (err) {
    console.error('[ratelimit] check failed, failing open', err)
    return null
  }
}
