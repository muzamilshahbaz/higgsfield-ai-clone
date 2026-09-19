import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { env, isSupabaseConfigured } from '@/lib/env'
import type { Database } from '@/types/database'

/** Routes that require a session. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/create',
  '/projects',
  '/library',
  '/history',
  '/settings',
]

/** Auth pages a signed-in user should not see. */
const AUTH_PREFIXES = ['/sign-in', '/sign-up', '/forgot-password']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Without config there is no session to refresh; let the page render its
  // own "connect Supabase" state rather than redirect-looping.
  if (!isSupabaseConfigured) return response

  const supabase = createServerClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Refreshes the auth token and writes it back onto the response.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
