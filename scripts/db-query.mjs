/**
 * Runs a read-only SQL statement against the linked database and prints the
 * rows as JSON. A verification tool for migrations and RLS checks, not part
 * of the app.
 *
 *   node scripts/db-query.mjs "select count(*) from public.generations"
 *   node scripts/db-query.mjs --file scripts/checks/rls.sql
 *
 * Shares its connection logic with apply-migration.mjs. Nothing here is
 * imported by the application.
 */

import { readFile } from 'node:fs/promises'
import process from 'node:process'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const args = process.argv.slice(2)
let sql = ''

if (args[0] === '--file') {
  sql = await readFile(args[1], 'utf8')
} else {
  sql = args.join(' ')
}

if (!sql.trim()) {
  console.error('Usage: node scripts/db-query.mjs "<sql>"  |  --file <path.sql>')
  process.exit(1)
}

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const password = process.env.SUPABASE_DB_PASSWORD

if (!projectUrl || !password) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD must be set in .env.local')
  process.exit(1)
}

const ref = new URL(projectUrl).hostname.split('.')[0]

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

  // Server notices are how a plpgsql check script reports progress. Without
  // this they are discarded, and a script that raises half way through says
  // only what broke and nothing about what had already passed.
  attempt.on('notice', (notice) => {
    if (notice?.message) console.log(`NOTICE: ${notice.message}`)
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
  console.error('Could not reach the database.')
  process.exit(1)
}

try {
  const result = await client.query(sql)
  const results = Array.isArray(result) ? result : [result]
  for (const one of results) {
    if (one.rows?.length) console.log(JSON.stringify(one.rows, null, 2))
    else console.log(`(${one.command ?? 'ok'}: ${one.rowCount ?? 0} rows)`)
  }
} catch (cause) {
  console.error(`✗ ${cause.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
