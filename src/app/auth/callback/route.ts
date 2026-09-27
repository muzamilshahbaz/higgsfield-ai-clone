import { NextResponse, type NextRequest } from 'next/server'

import { logEvent } from '@/lib/admin/audit'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/validation/auth'

/**
 * The single landing point for every link Supabase sends a user back on:
 * Google OAuth, email confirmation and password recovery.
 *
 * Supabase issues a one-time `code` which is exchanged here for a cookie
 * session. Anything that goes wrong lands on /auth/auth-code-error with a
 * readable reason rather than a 500.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  // The provider itself refused (consent denied, provider disabled, ...).
  const providerError = searchParams.get('error')
  const providerErrorDescription = searchParams.get('error_description')

  if (providerError) {
    const url = new URL('/auth/auth-code-error', origin)
    url.searchParams.set('reason', providerErrorDescription ?? providerError)
    return NextResponse.redirect(url)
  }

  if (!code) {
    const url = new URL('/auth/auth-code-error', origin)
    url.searchParams.set('reason', 'That sign-in link is missing its code.')
    return NextResponse.redirect(url)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const url = new URL('/auth/auth-code-error', origin)
    url.searchParams.set(
      'reason',
      // A reused or stale link is by far the most common cause, so say so.
      /expired|invalid/i.test(error.message)
        ? 'That link has already been used or has expired.'
        : error.message,
    )
    return NextResponse.redirect(url)
  }

  /*
   * Record the sign-in.
   *
   * Awaited rather than fired and forgotten: a Server Route that returns a redirect can have its
   * execution torn down the moment the response is sent, and a floating promise would sometimes
   * write and sometimes not. `logEvent` never throws and never blocks on failure, so the cost of
   * awaiting it is one insert on a path that already did a token exchange.
   *
   * This is what the sign-in history on a user's admin page reads. It only covers sessions
   * established through this callback — OAuth, email confirmation, password recovery — which is
   * stated on that page rather than implied, because a password sign-in does not come through
   * here.
   */
  if (data.user) {
    await logEvent({
      source: 'auth',
      event: 'auth.callback',
      message: `Session established for ${data.user.email ?? data.user.id}`,
      userId: data.user.id,
      context: {
        provider: data.user.app_metadata?.provider ?? 'email',
        // `next` is already validated by `safeNextPath`, so this cannot record an open redirect
        // that the app would not have followed.
        next,
      },
    })
  }

  // Behind a proxy (Vercel), `origin` is the internal host — prefer the
  // forwarded one so the user is not bounced to an unreachable URL.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const base = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin

  return NextResponse.redirect(new URL(next, base))
}
