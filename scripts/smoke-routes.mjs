/**
 * Walks every route in the app against the running dev server and reports the status.
 *
 * Signed in as the promoted QA account, so the admin routes are reached as a super admin rather
 * than as a redirect. The session cookie is obtained the way a browser would: by posting the
 * sign-in form and keeping what Supabase sets.
 *
 * A route that redirects is reported as the destination rather than as a failure — /dashboard
 * redirecting a signed-out caller to /sign-in is correct behaviour, and the point of this script is
 * to find the 500s.
 */

import process from 'node:process'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'

const PUBLIC_ROUTES = [
  '/',
  '/explore',
  '/presets',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/robots.txt',
  '/sitemap.xml',
  '/api/health',
]

const STUDIO_ROUTES = [
  '/dashboard',
  '/create',
  '/projects',
  '/library',
  '/history',
  '/favourites',
  '/settings',
  '/settings/keys',
  '/settings/billing',
]

const ADMIN_ROUTES = [
  '/admin',
  '/admin/analytics',
  '/admin/statistics',
  '/admin/landing',
  '/admin/features',
  '/admin/faq',
  '/admin/testimonials',
  '/admin/announcements',
  '/admin/categories',
  '/admin/media',
  '/admin/pricing',
  '/admin/plans',
  '/admin/credits',
  '/admin/providers',
  '/admin/providers/keys',
  '/admin/models',
  '/admin/presets',
  '/admin/users',
  '/admin/explore',
  '/admin/assets',
  '/admin/projects',
  '/admin/branding',
  '/admin/theme',
  '/admin/flags',
  '/admin/settings',
  '/admin/logs',
  '/admin/audit',
]

/** Everything Set-Cookie gave us, folded into one request header. */
function collectCookies(response, jar) {
  const raw = response.headers.getSetCookie?.() ?? []
  for (const line of raw) {
    const [pair] = line.split(';')
    const index = pair.indexOf('=')
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1))
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function signIn(email, password) {
  const jar = new Map()

  // Prime the session cookie and pick up whatever the page sets.
  const page = await fetch(`${BASE}/sign-in`, { redirect: 'manual' })
  collectCookies(page, jar)

  /*
   * Sign in through Supabase's own token endpoint rather than the app's form.
   *
   * The form is a Server Action, which needs an action id from the rendered page — brittle to
   * scrape and different on every build. Going to the auth endpoint directly gets the same tokens
   * the app would store, and the cookie format is the one @supabase/ssr reads.
   */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anon },
    body: JSON.stringify({ email, password }),
  })

  if (!auth.ok) {
    throw new Error(`Sign-in failed: ${auth.status} ${await auth.text()}`)
  }

  const session = await auth.json()
  const ref = new URL(url).hostname.split('.')[0]

  /*
   * The cookie @supabase/ssr reads.
   *
   * It stores the session as base64-prefixed JSON under `sb-<ref>-auth-token`, chunked when it is
   * long. This session fits in one chunk; if it ever does not, the app would simply see no session
   * and every protected route would report a redirect to sign-in, which is visible in the output
   * rather than silent.
   */
  const payload = Buffer.from(JSON.stringify(session)).toString('base64')
  jar.set(`sb-${ref}-auth-token`, `base64-${payload}`)

  return jar
}

async function walk(label, routes, jar) {
  console.log(`\n${label}`)
  let failures = 0

  for (const route of routes) {
    try {
      const response = await fetch(`${BASE}${route}`, {
        redirect: 'manual',
        headers: jar ? { cookie: cookieHeader(jar) } : {},
      })

      const status = response.status
      const location = response.headers.get('location')

      if (status >= 500) {
        failures += 1
        console.log(`  ✗ ${status} ${route}`)
      } else if (location) {
        console.log(`  → ${status} ${route}  →  ${location}`)
      } else {
        console.log(`  ✓ ${status} ${route}`)
      }
    } catch (cause) {
      failures += 1
      console.log(`  ✗ ERR ${route}  ${cause.message}`)
    }
  }

  return failures
}

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.local' })

const account = JSON.parse(
  await (await import('node:fs/promises')).readFile('.qa-account.local.json', 'utf8'),
)

let failures = 0

failures += await walk('Public, signed out', PUBLIC_ROUTES, null)

const jar = await signIn(account.email, account.password)
console.log(`\nSigned in as ${account.email}`)

failures += await walk('Studio, signed in', STUDIO_ROUTES, jar)
failures += await walk('Admin, signed in as super_admin', ADMIN_ROUTES, jar)

console.log(`\n${failures === 0 ? '✓ no 5xx responses' : `✗ ${failures} route(s) failed`}`)
process.exitCode = failures === 0 ? 0 : 1
