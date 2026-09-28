/**
 * Walks the admin panel as every role and checks what each one is actually given.
 *
 *   node scripts/smoke-roles.mjs            # against http://localhost:3000
 *   SMOKE_BASE=https://… node scripts/smoke-roles.mjs
 *
 * Three questions, asked of a running server rather than of the capability
 * matrix, because the matrix passing its unit tests does not prove the pages
 * consult it:
 *
 *   1. which admin routes each role is served, and where the others send them
 *   2. where a visitor lands — signed out, signed in as staff, signed in as not
 *   3. whether a read-only admin's markup actually arrives with its controls
 *      disabled, and its tables still searchable
 *
 * It borrows the QA account from `.qa-account.local.json` and moves its role
 * between runs, restoring whatever it found at the end — including after a
 * failure, which is why the restore is in a `finally`. Never point it at an
 * account somebody is using.
 *
 * Checking the markup rather than a screenshot is deliberate: "is this control
 * disabled" is an attribute in the HTML the server sent, so this asserts the
 * thing itself, and needs no browser.
 */

import process from 'node:process'
import { readFile } from 'node:fs/promises'

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'
const HANDLE = process.env.SMOKE_HANDLE ?? 'qaexplore679423cd'

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

const STAFF = ['viewer', 'editor', 'moderator', 'admin', 'super_admin']

/** "an admin", "a viewer" — the output is read by people. */
const article = (role) => `${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}`

let failures = 0
function check(name, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

/**
 * The cookie @supabase/ssr reads.
 *
 * Obtained from the auth endpoint rather than by posting the sign-in form: the
 * form is a Server Action whose id changes with every build, and the tokens are
 * the same either way.
 */
async function signIn() {
  const account = JSON.parse(await readFile('.qa-account.local.json', 'utf8'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: account.email, password: account.password }),
  })
  if (!response.ok) throw new Error(`QA sign-in failed: ${response.status}`)
  const session = await response.json()
  const ref = new URL(url).hostname.split('.')[0]
  const payload = Buffer.from(JSON.stringify(session)).toString('base64')
  return `sb-${ref}-auth-token=base64-${payload}`
}

const setRole = (role) => db.from('profiles').update({ role }).eq('handle', HANDLE)

async function where(path, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  })
  const location = response.headers.get('location')
  if (!location) return { status: response.status, to: null }
  const url = new URL(location, BASE)
  return { status: response.status, to: url.pathname + url.search }
}

const original = (await db.from('profiles').select('role').eq('handle', HANDLE).single()).data?.role
if (!original) {
  console.error(`No account with handle "${HANDLE}". Set SMOKE_HANDLE.`)
  process.exit(1)
}

const cookie = await signIn()

try {
  // ------------------------------------------------------------ route access
  console.log('\nWhich admin routes each role is served')

  for (const role of [...STAFF, 'user']) {
    await setRole(role)
    let served = 0
    const sentAway = []
    let errored = 0

    for (const route of ADMIN_ROUTES) {
      const { status, to } = await where(route, cookie)
      if (status >= 500) errored += 1
      else if (to) sentAway.push(`${route} → ${to}`)
      else served += 1
    }

    console.log(`\n  ${role}: ${served} served, ${sentAway.length} redirected`)
    check('no route errored', errored === 0, errored ? `${errored} 5xx` : '')

    if (role === 'user') {
      check('an ordinary user reaches nothing', served === 0)
      check('and is sent to the studio, not shown a 403', sentAway.every((line) => line.endsWith('/dashboard')))
    }
    if (role === 'viewer' || role === 'admin' || role === 'super_admin') {
      check(`${article(role)} opens every screen`, served === ADMIN_ROUTES.length)
    }
    if (role === 'editor' || role === 'moderator') {
      check(`${article(role)} is held out of some sections`, sentAway.length > 0)
      for (const line of sentAway) console.log(`      ${line}`)
    }
  }

  // ---------------------------------------------------------------- redirects
  console.log('\nWhere each visitor lands')

  const signedOut = await where('/admin/users', null)
  check(
    'signed out, the panel asks for a session and remembers the destination',
    signedOut.to === '/sign-in?next=%2Fadmin%2Fusers',
    signedOut.to ?? 'served',
  )

  for (const role of STAFF) {
    await setRole(role)
    const landing = await where('/sign-in', cookie)
    check(`${article(role)}, signed in, is sent to the panel`, landing.to === '/admin', landing.to ?? 'served')
  }

  await setRole('user')
  const userLanding = await where('/sign-in', cookie)
  check('a signed-in user is sent to the studio', userLanding.to === '/dashboard', userLanding.to ?? 'served')

  // --------------------------------------------------------- read-only markup
  console.log('\nWhat a read-only admin is handed')

  const read = async (path) => (await fetch(`${BASE}${path}`, { headers: { cookie } })).text()

  for (const role of ['viewer', 'super_admin']) {
    await setRole(role)
    const expectReadOnly = role === 'viewer'
    const [theme, users] = await Promise.all([read('/admin/theme'), read('/admin/users')])

    console.log(`\n  as ${role}`)
    check('the Read only badge matches the role', theme.includes('Read only') === expectReadOnly)

    // `disabled=""`, not `\sdisabled`: every Button carries `disabled:opacity-50`
    // in its class list and a looser pattern matches that instead.
    check(
      'the form fields match the role',
      /<fieldset[^>]*\sdisabled=""/.test(theme) === expectReadOnly,
    )

    const save = theme.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?Save the theme/)?.[0] ?? ''
    check('the Save button matches the role', /\sdisabled=""/.test(save) === expectReadOnly, save ? '' : 'not found')

    // The half that must NOT change: a read-only admin still investigates.
    const search = users.match(/<input[^>]*placeholder="[^"]*"[^>]*\/?>/i)?.[0] ?? ''
    check('the search box is there and usable', search !== '' && !/\sdisabled=""/.test(search))
    check('the table still renders', /<table/.test(users))
  }
} finally {
  await setRole(original)
  console.log(`\n  ${HANDLE} restored to ${original}`)
}

console.log(failures === 0 ? '\n✓ every role got what it should' : `\n✗ ${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
