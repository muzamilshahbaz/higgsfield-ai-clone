/**
 * Grants a staff role to an existing account.
 *
 *   node scripts/grant-role.mjs you@example.com super_admin
 *   node scripts/grant-role.mjs you@example.com user        # demote
 *
 * The bootstrap problem this solves: the admin panel can appoint staff, but only a super_admin can
 * appoint the first one — and a fresh database has none. Every account starts as 'user', so there
 * has to be exactly one way in that does not go through the panel, and it should be a deliberate
 * command run by whoever owns the database rather than a hidden first-run screen anybody could hit.
 *
 * This is also the recovery path. If the last super_admin is deleted at the provider level, or
 * somebody demotes themselves through the database, this is how access comes back.
 *
 * Connects straight to Postgres with the credentials in .env.local and never prints them. Nothing
 * here is imported by the application.
 */

import process from 'node:process'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const ROLES = ['user', 'viewer', 'editor', 'moderator', 'admin', 'super_admin']

const [email, role] = process.argv.slice(2)

if (!email || !role) {
  console.error('Usage: node scripts/grant-role.mjs <email> <role>')
  console.error(`Roles:  ${ROLES.join(', ')}`)
  process.exit(1)
}

if (!ROLES.includes(role)) {
  console.error(`"${role}" is not a role. Use one of: ${ROLES.join(', ')}`)
  process.exit(1)
}

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const password = process.env.SUPABASE_DB_PASSWORD

if (!projectUrl || !password) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD must be set in .env.local')
  process.exit(1)
}

const ref = new URL(projectUrl).hostname.split('.')[0]

/**
 * Candidate hosts, cheapest first — the same list as scripts/apply-migration.mjs.
 *
 * The direct host is IPv6-only and unreachable from some networks, so the session-mode poolers are
 * tried as well.
 */
const candidates = [
  process.env.POSTGRES_HOST && {
    host: process.env.POSTGRES_HOST,
    user: `postgres.${ref}`,
    label: 'POSTGRES_HOST',
  },
  { host: `db.${ref}.supabase.co`, user: 'postgres', label: 'direct' },
  ...[
    'ap-south-1',
    'us-east-1',
    'us-west-1',
    'eu-west-1',
    'eu-central-1',
    'ap-southeast-1',
    'ap-northeast-1',
  ].map((region) => ({
    host: `aws-0-${region}.pooler.supabase.com`,
    user: `postgres.${ref}`,
    label: `pooler ${region}`,
  })),
].filter(Boolean)

const { default: pg } = await import('pg')

let client = null

for (const candidate of candidates) {
  const attempt = new pg.Client({
    host: candidate.host,
    port: 5432,
    user: candidate.user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  })

  try {
    await attempt.connect()
    client = attempt
    break
  } catch {
    await attempt.end().catch(() => {})
  }
}

if (!client) {
  console.error('Could not reach the database on any known host.')
  process.exit(1)
}

try {
  const { rows } = await client.query(
    `update public.profiles
        set role = $2
      where lower(email) = lower($1)
      returning handle, email, role`,
    [email, role],
  )

  if (rows.length === 0) {
    console.error(`No account with the email ${email}. They have to sign up first.`)
    process.exitCode = 1
  } else {
    const [row] = rows
    console.log(`✓ @${row.handle} (${row.email}) is now ${row.role}.`)

    if (role !== 'user') {
      console.log('  They can open /admin on their next request — no re-sign-in needed.')
    }

    /*
     * Warn when this leaves nobody who can reach the key vault.
     *
     * Not refused: demoting the last super_admin through the database is a legitimate thing to do
     * while decommissioning, and this script exists partly to undo a mistake. But it is worth
     * saying out loud, because the panel itself refuses this exact change and somebody reaching
     * for this script may not have noticed why.
     */
    const { rows: remaining } = await client.query(
      `select count(*)::int as count
         from public.profiles
        where role = 'super_admin' and status = 'active'`,
    )

    if (remaining[0]?.count === 0) {
      console.warn(
        '\n! There is now no active super admin. Nobody can reach the provider key vault or appoint staff.',
      )
      console.warn('  Run this script again with super_admin to restore access.')
    }
  }
} catch (cause) {
  console.error(`Could not update that account: ${cause.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
