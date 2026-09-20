import 'server-only'

import { getProvider } from '@/lib/ai/catalogue'
import { fragmentsOf, maskKey, open, seal } from '@/lib/crypto/secret-box'
import { env, isKeyVaultConfigured } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/supabase/server'
import { verifyProviderKey } from '@/services/ai/ai-router'
import type { ProviderKeyStatus, ProviderName, UserProviderKeyRow } from '@/types/database'

/**
 * The provider key vault.
 *
 * Every read and write goes through the service-role client, because
 * `user_provider_keys` has RLS enabled with no policies — see migration 0007
 * for why. That makes `.eq('user_id', user.id)` on every single query load
 * bearing: no policy is going to catch a missing one.
 *
 * The other invariant: nothing in this file returns a decrypted key to a
 * caller that renders. `listMyConnections` returns masked metadata built from
 * stored fragments, and `getUserProviderKey` — the one function that does
 * decrypt — takes a userId rather than reading the session, so it can only be
 * called from a server path that already knows whose job it is running.
 */

export interface ProviderConnection {
  provider: ProviderName
  label: string | null
  /** `sk-••••••••1234`. Built from fragments, never from a decrypted key. */
  masked: string
  status: ProviderKeyStatus
  lastVerifiedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type KeyFailure =
  | { code: 'UNAUTHENTICATED' }
  | { code: 'NOT_CONFIGURED' }
  | { code: 'UNKNOWN_PROVIDER' }
  | { code: 'NOT_CONNECTED' }
  | { code: 'ERROR' }

export type KeyResult<T> = { ok: true; data: T } | ({ ok: false; message: string } & KeyFailure)

function toConnection(row: UserProviderKeyRow): ProviderConnection {
  return {
    provider: row.provider,
    label: row.label,
    masked: maskKey(row.key_prefix, row.last4),
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * The columns a display path is allowed to see.
 *
 * Spelled out rather than `select('*')` so that adding a column to the table
 * cannot accidentally widen what reaches a component — `ciphertext` is one
 * careless asterisk away from a React prop.
 */
const DISPLAY_COLUMNS =
  'provider, label, key_prefix, last4, status, last_verified_at, last_error, created_at, updated_at'

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Every vendor the signed-in user has connected. Masked metadata only. */
export async function listMyConnections(): Promise<ProviderConnection[]> {
  if (!isKeyVaultConfigured) return []

  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await createAdminClient()
    .from('user_provider_keys')
    .select(DISPLAY_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[ai-keys.service] list failed:', error.message)
    return []
  }

  return (data ?? []).map((row) => toConnection(row as UserProviderKeyRow))
}

/**
 * The decrypted key for one user and vendor, for the generation path only.
 *
 * Takes an explicit userId instead of reading the session: the caller is
 * already inside a job it has authorised, and a function that resolves "whose
 * key?" from ambient state is one refactor away from handing a background
 * sweep the wrong user's credential.
 *
 * Returns null for every failure — no key, no secret configured, a ciphertext
 * that will not open. The router's answer to all three is the same fallback.
 */
export async function getUserProviderKey(
  userId: string,
  provider: ProviderName,
): Promise<string | null> {
  if (!isKeyVaultConfigured || !env.aiKeySecret) return null

  const { data, error } = await createAdminClient()
    .from('user_provider_keys')
    .select('ciphertext, status')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) {
    console.error('[ai-keys.service] key read failed:', error.message)
    return null
  }
  if (!data) return null

  // A key the vendor told us is dead is not worth a failed job and a refund.
  if (data.status === 'invalid') return null

  const plaintext = open(data.ciphertext, env.aiKeySecret)
  if (!plaintext) {
    console.error(
      `[ai-keys.service] ciphertext for ${provider} would not open — AI_KEY_ENCRYPTION_SECRET may have changed.`,
    )
    return null
  }

  return plaintext
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function notConfigured(): KeyResult<never> {
  return {
    ok: false,
    code: 'NOT_CONFIGURED',
    message:
      'Key storage is unavailable: set AI_KEY_ENCRYPTION_SECRET and SUPABASE_SERVICE_ROLE_KEY.',
  }
}

/**
 * Stores a key, then verifies it.
 *
 * In that order, deliberately. Verification is a network call to someone
 * else's service; if it hangs or the deploy is torn down mid-request, a user
 * who pasted a good key should not have to paste it again. The row lands
 * first as `unverified` and the status is patched when the answer arrives.
 */
export async function saveProviderKey(input: {
  provider: ProviderName
  apiKey: string
  label?: string | null
}): Promise<KeyResult<ProviderConnection>> {
  if (!isKeyVaultConfigured || !env.aiKeySecret) return notConfigured()

  const user = await getCurrentUser()
  if (!user) return { ok: false, code: 'UNAUTHENTICATED', message: 'You need to be signed in.' }

  const descriptor = getProvider(input.provider)
  if (!descriptor) {
    return { ok: false, code: 'UNKNOWN_PROVIDER', message: 'That provider is not supported.' }
  }

  const rawKey = input.apiKey.trim()
  const { prefix, last4 } = fragmentsOf(rawKey)

  let ciphertext: string
  try {
    ciphertext = seal(rawKey, env.aiKeySecret)
  } catch (cause) {
    console.error('[ai-keys.service] seal failed:', cause instanceof Error ? cause.message : cause)
    return { ok: false, code: 'ERROR', message: 'Could not encrypt that key.' }
  }

  const { data: saved, error } = await createAdminClient()
    .from('user_provider_keys')
    .upsert(
      {
        user_id: user.id,
        provider: input.provider,
        label: input.label?.trim() || null,
        ciphertext,
        key_prefix: prefix,
        last4,
        status: 'unverified' as ProviderKeyStatus,
        last_error: null,
        last_verified_at: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select(DISPLAY_COLUMNS)
    .single()

  if (error || !saved) {
    console.error('[ai-keys.service] upsert failed:', error?.message)
    return { ok: false, code: 'ERROR', message: 'Could not save that key.' }
  }

  const verified = await applyVerification(user.id, input.provider, rawKey)
  return { ok: true, data: verified ?? toConnection(saved as UserProviderKeyRow) }
}

/** Re-checks a stored key against its vendor. */
export async function testProviderKey(
  provider: ProviderName,
): Promise<KeyResult<ProviderConnection>> {
  if (!isKeyVaultConfigured) return notConfigured()

  const user = await getCurrentUser()
  if (!user) return { ok: false, code: 'UNAUTHENTICATED', message: 'You need to be signed in.' }

  const rawKey = await readKeyIncludingInvalid(user.id, provider)
  if (!rawKey) {
    return { ok: false, code: 'NOT_CONNECTED', message: 'There is no key stored for that provider.' }
  }

  const connection = await applyVerification(user.id, provider, rawKey)
  if (!connection) return { ok: false, code: 'ERROR', message: 'Could not update that key.' }

  return { ok: true, data: connection }
}

export async function deleteProviderKey(provider: ProviderName): Promise<KeyResult<null>> {
  if (!isKeyVaultConfigured) return notConfigured()

  const user = await getCurrentUser()
  if (!user) return { ok: false, code: 'UNAUTHENTICATED', message: 'You need to be signed in.' }

  const { error } = await createAdminClient()
    .from('user_provider_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  if (error) {
    console.error('[ai-keys.service] delete failed:', error.message)
    return { ok: false, code: 'ERROR', message: 'Could not remove that key.' }
  }

  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Like getUserProviderKey but does not skip keys marked invalid.
 *
 * "Test again" has to work on the key the vendor last rejected — that is the
 * whole reason someone presses it after fixing a permission.
 */
async function readKeyIncludingInvalid(
  userId: string,
  provider: ProviderName,
): Promise<string | null> {
  if (!env.aiKeySecret) return null

  const { data } = await createAdminClient()
    .from('user_provider_keys')
    .select('ciphertext')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (!data) return null
  return open(data.ciphertext, env.aiKeySecret)
}

/** Runs verification and writes the result back. Returns the fresh row. */
async function applyVerification(
  userId: string,
  provider: ProviderName,
  rawKey: string,
): Promise<ProviderConnection | null> {
  const result = await verifyProviderKey(provider, rawKey)

  const { data, error } = await createAdminClient()
    .from('user_provider_keys')
    .update({
      status: result.status,
      // Only a real answer sets the timestamp. "We could not reach them" is
      // not a verification, and a stale tick beside it would read as one.
      last_verified_at: result.status === 'valid' ? new Date().toISOString() : null,
      last_error: result.status === 'valid' ? null : result.message,
    })
    .eq('user_id', userId)
    .eq('provider', provider)
    .select(DISPLAY_COLUMNS)
    .single()

  if (error || !data) {
    console.error('[ai-keys.service] status write failed:', error?.message)
    return null
  }

  return toConnection(data as UserProviderKeyRow)
}
