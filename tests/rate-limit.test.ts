import { afterEach, describe, expect, it, vi } from 'vitest'

import { clientKey, rateLimit, resetRateLimits, tooManyRequests } from '@/lib/rate-limit'

/**
 * The limiter is a brake, not a guarantee — but a brake that miscounts, never
 * resets, or lets two callers share a bucket is worse than none, because it
 * would be trusted.
 */

afterEach(() => {
  resetRateLimits()
  vi.useRealTimers()
})

const rule = { limit: 3, windowMs: 60_000 }

describe('rateLimit', () => {
  it('allows exactly the limit, then refuses', () => {
    expect(rateLimit('a', rule).ok).toBe(true)
    expect(rateLimit('a', rule).ok).toBe(true)
    expect(rateLimit('a', rule).ok).toBe(true)
    expect(rateLimit('a', rule).ok).toBe(false)
  })

  it('counts down remaining and never goes negative', () => {
    expect(rateLimit('b', rule).remaining).toBe(2)
    expect(rateLimit('b', rule).remaining).toBe(1)
    expect(rateLimit('b', rule).remaining).toBe(0)
    expect(rateLimit('b', rule).remaining).toBe(0)
  })

  it('keeps separate keys separate', () => {
    rateLimit('one', rule)
    rateLimit('one', rule)
    rateLimit('one', rule)

    expect(rateLimit('one', rule).ok).toBe(false)
    expect(rateLimit('two', rule).ok).toBe(true)
  })

  it('opens again once the window passes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    rateLimit('c', rule)
    rateLimit('c', rule)
    rateLimit('c', rule)
    expect(rateLimit('c', rule).ok).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
    expect(rateLimit('c', rule).ok).toBe(true)
  })

  it('reports a retry-after the caller can act on', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    rateLimit('d', rule)
    vi.setSystemTime(new Date('2026-01-01T00:00:30Z'))

    const result = rateLimit('d', rule)
    expect(result.retryAfterSec).toBeGreaterThan(0)
    expect(result.retryAfterSec).toBeLessThanOrEqual(30)
  })
})

describe('clientKey', () => {
  function request(headers: Record<string, string> = {}): Request {
    return new Request('https://example.test/api/explore', { headers })
  }

  it('prefers the user id, so a limit follows the account across devices', () => {
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4' }), 'user-1')).toBe('user:user-1')
  })

  it('falls back to the first hop of x-forwarded-for', () => {
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe(
      'ip:1.2.3.4',
    )
  })

  it('accepts x-real-ip when there is no forwarded chain', () => {
    expect(clientKey(request({ 'x-real-ip': '5.6.7.8' }))).toBe('ip:5.6.7.8')
  })

  it('never returns an empty key, which would pool every caller into one bucket', () => {
    expect(clientKey(request())).toBe('ip:unknown')
    expect(clientKey(request({ 'x-forwarded-for': '   ' }))).toBe('ip:unknown')
  })
})

describe('tooManyRequests', () => {
  it('sends the headers a client needs to back off politely', async () => {
    const result = rateLimit('e', rule)
    const response = tooManyRequests(result, 'Slow down.')

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe(String(result.retryAfterSec))
    expect(response.headers.get('x-ratelimit-limit')).toBe('3')

    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(body.error.message).toBe('Slow down.')
  })
})
