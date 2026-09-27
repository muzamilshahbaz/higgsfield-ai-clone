/**
 * Creates (or refreshes) a throwaway account for exercising the app locally.
 *
 *   node scripts/qa-account.mjs            # create, or reuse if it exists
 *   node scripts/qa-account.mjs --reset    # give the existing one a new password
 *
 * The credentials are generated here and written to `.qa-account.local.json`,
 * which `.gitignore` already excludes via the `.env*.local` sibling rule added
 * below — they are never printed to a terminal transcript and never committed.
 *
 * This exists because verifying Explore end to end needs two things a signed-out
 * visitor cannot do: like something, and own something. Signing in as a real
 * user's account to test is not an option, and hand-made accounts drift — this
 * one is disposable and reproducible.
 *
 * Deletes cleanly:  node scripts/qa-account.mjs --delete
 */

import { randomBytes } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const CREDENTIALS_FILE = resolve(process.cwd(), '.qa-account.local.json')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const mode = process.argv[2] ?? '--create'

/** A password that satisfies the app's own sign-up rules by construction. */
function generatePassword() {
  return `Qa-${randomBytes(12).toString('base64url')}-2026`
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(CREDENTIALS_FILE, 'utf8'))
  } catch {
    return null
  }
}

async function findByEmail(email) {
  // The admin API has no get-by-email, so this pages until it finds one. A
  // local project has a handful of users; this is not a hot path.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)

    const match = data.users.find((user) => user.email === email)
    if (match) return match
    if (data.users.length < 200) return null
  }
  return null
}

const existing = await readExisting()

if (mode === '--delete') {
  if (!existing) {
    console.log('No QA account on record.')
    process.exit(0)
  }

  const user = await findByEmail(existing.email)
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      console.error(`Could not delete: ${error.message}`)
      process.exit(1)
    }
  }

  await unlink(CREDENTIALS_FILE).catch(() => {})
  console.log('QA account deleted; every row it owned cascaded away with it.')
  process.exit(0)
}

const email = existing?.email ?? `qa.explore.${randomBytes(4).toString('hex')}@kinetic.test`
const password = generatePassword()

const user = await findByEmail(email)

if (user && mode === '--reset') {
  const { error } = await admin.auth.admin.updateUserById(user.id, { password })
  if (error) {
    console.error(`Could not reset the password: ${error.message}`)
    process.exit(1)
  }
  await writeFile(CREDENTIALS_FILE, JSON.stringify({ email, password, id: user.id }, null, 2))
  console.log(`Password reset for the QA account (${user.id}).`)
  console.log(`Credentials are in ${CREDENTIALS_FILE} — not printed here, not committed.`)
  process.exit(0)
}

if (user) {
  console.log(`QA account already exists (${user.id}). Use --reset to change its password.`)
  process.exit(0)
}

// `email_confirm` so the account is usable immediately: the local project has
// no mail transport, and an unconfirmed user cannot sign in.
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Explore QA' },
})

if (error) {
  console.error(`Could not create the QA account: ${error.message}`)
  process.exit(1)
}

await writeFile(
  CREDENTIALS_FILE,
  JSON.stringify({ email, password, id: data.user.id }, null, 2),
)

console.log(`QA account created (${data.user.id}).`)
console.log(`Credentials are in ${CREDENTIALS_FILE} — not printed here, not committed.`)
console.log('Remove it with: node scripts/qa-account.mjs --delete')
