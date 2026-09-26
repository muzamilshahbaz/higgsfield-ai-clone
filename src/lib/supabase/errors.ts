import 'server-only'

/**
 * Postgres errors worth recognising by name.
 *
 * Almost every database failure is ours to fix and belongs in a log, not in a
 * message to a user. The exception is a schema that is behind the code: a
 * provider name the application knows and the `provider_name` enum does not.
 * That is a migration somebody has not run yet, and it is the one database
 * error with an obvious instruction attached — so it gets a sentence a person
 * can act on instead of a 500.
 */

interface PostgresErrorish {
  code?: string | null
  message?: string | null
}

/**
 * 22P02 is `invalid_text_representation`, which is what Postgres raises for a
 * value that is not a member of an enum. Matching the enum name as well keeps
 * this from claiming a malformed uuid is a missing migration.
 */
export function isUnknownProviderEnumValue(error: PostgresErrorish | null | undefined): boolean {
  if (!error) return false

  const message = error.message ?? ''
  return error.code === '22P02' && message.includes('provider_name')
}

/** The instruction that goes with it. Names the file, because that is the fix. */
export const PENDING_PROVIDER_MIGRATION =
  'This deployment is missing a database migration: run supabase/migrations/0010_huggingface_provider.sql, then try again.'
