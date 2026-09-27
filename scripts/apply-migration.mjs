/**
 * Applies one migration file to the linked Supabase database.
 *
 * `npm run db:push` shells out to the Supabase CLI, which needs a linked
 * project and a full-access access token. Neither is available in every
 * environment this repo is worked on from, and `db push` would also try to
 * replay 0001_schema.sql — which has no IF NOT EXISTS guards and fails
 * partway through on a database that already has the schema.
 *
 * This connects straight to Postgres instead and runs one named file inside a
 * transaction, so a migration either lands whole or not at all.
 *
 *   node scripts/apply-migration.mjs 0013_explore_social.sql
 *
 * The connection is assembled from the environment and never printed. The
 * direct host (db.<ref>.supabase.co) is IPv6-only and unreachable from some
 * networks, so the session-mode pooler is tried as well — session mode, not
 * transaction mode, because DDL needs a real session.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <migration-file.sql>')
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
 * Candidate hosts, cheapest first.
 *
 * `POSTGRES_HOST` lets an operator name the pooler region directly when the
 * guesses below are wrong; everything else is the documented Supabase layout.
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

const sqlPath = path.join('supabase', 'migrations', file)
const sql = await readFile(sqlPath, 'utf8')

let client = null
let connectedTo = null

for (const candidate of candidates) {
  const attempt = new pg.Client({
    host: candidate.host,
    port: 5432,
    user: candidate.user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
    // A migration that adds indexes to a populated table can outlast the
    // default statement timeout; DDL here is allowed to take its time.
    statement_timeout: 300_000,
  })

  try {
    await attempt.connect()
    client = attempt
    connectedTo = candidate.label
    break
  } catch (cause) {
    await attempt.end().catch(() => {})
    console.error(`  · ${candidate.label}: ${cause.code ?? cause.message}`)
  }
}

if (!client) {
  console.error('\nCould not reach the database on any known host.')
  process.exit(1)
}

console.log(`Connected via ${connectedTo}. Applying ${file}…`)

try {
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log(`✓ ${file} applied.`)
} catch (cause) {
  await client.query('rollback').catch(() => {})
  console.error(`\n✗ ${file} failed and was rolled back:`)
  console.error(`  ${cause.message}`)
  if (cause.detail) console.error(`  detail: ${cause.detail}`)
  if (cause.hint) console.error(`  hint:   ${cause.hint}`)
  if (cause.position) console.error(`  at character ${cause.position}`)
  process.exitCode = 1
} finally {
  await client.end()
}
