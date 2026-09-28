import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { postSignInPath } from '@/lib/admin/permissions'
import { env, isSupabaseConfigured } from '@/lib/env'
import type { Database } from '@/types/database'

/** Routes that require a session. */
const PROTECTED_PREFIXES = [
  // The panel guards itself in app/admin/layout.tsx — this is the edge saying the
  // same thing earlier, so a signed-out visitor is redirected before any admin
  // code runs and comes back to /admin rather than to the dashboard.
  '/admin',
  '/dashboard',
  '/create',
  '/projects',
  '/library',
  '/history',
  '/settings',
  // Explore is deliberately absent — it is the one studio surface a stranger
  // can browse. Favourites is not: it is one person's saved list, and there is
  // no signed-out version of it that means anything.
  '/favourites',
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
    // The query survives the round trip: /create?preset=orbit must come back
    // with its preset still chosen, not as a bare composer.
    const target = `${pathname}${request.nextUrl.search}`
    url.pathname = '/sign-in'
    url.search = ''
    url.searchParams.set('next', target)
    return NextResponse.redirect(url)
  }

  if (user && AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone()
    /*
     * Where a signed-in visitor goes when they open a sign-in page they no
     * longer need. Staff belong in the panel, so this costs one profile read —
     * on a path nobody navigates to twice, which is why it is affordable here
     * and would not be on every request.
     *
     * It is a redirect, not a grant: /admin runs its own guard on arrival, so a
     * wrong answer here sends somebody to a page that bounces them back.
     */
    url.pathname = await homeFor(supabase, user.id)
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

/** The signed-in home for this account. Never throws; defaults to the studio. */
async function homeFor(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', userId)
      .maybeSingle()
    return postSignInPath(data?.role, data?.status)
  } catch {
    return '/dashboard'
  }
}
