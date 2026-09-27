import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { getProvider } from '@/lib/ai/catalogue'
import { fragmentsOf, maskKey, open, seal } from '@/lib/crypto/secret-box'
import { env, isKeyVaultConfigured, serverProviderKey } from '@/lib/env'
import { cmsAdminClient } from '@/lib/supabase/cms'
import { verifyProviderKey } from '@/services/ai/ai-router'
import type { AppProviderKeyRow } from '@/types/cms'
import type { ProviderKeyStatus, ProviderName } from '@/types/database'

/**
 * The operator's shared vendor keys.
 *
 * This is the second step of the routing chain in services/ai/ai-router.ts: a
 * user's own key wins, and this covers everyone who has not connected one. Until
 * now that fallback could only come from an environment variable, which means a
 * redeploy to rotate a key.
 *
 * Four rules, and they are the reason this file exists separately from the CRUD
 * helper every other CMS table uses:
 *
 * 1. **Database first, environment second.** `resolveSharedKeys` reads this table
 *    and falls back to `serverProviderKey()`. A deployment that never opens the
 *    admin panel behaves exactly as it did, and one that stores a key here can
 *    rotate it without touching Vercel.
 *
 * 2. **Nothing that renders is given a key.** `listAppProviderKeys` returns
 *    masked metadata built from the stored fragments — never from a decryption —
 *    and the select list is spelled out so that adding a column to the table
 *    cannot widen what reaches a component. `ciphertext` is one careless asterisk
 *    from being a React prop.
 *
 * 3. **The decrypting function takes no session.** `resolveSharedKeys` is called
 *    from the generation path, which has already authorised the job. Nothing here
 *    resolves "whose key?" from ambient state.
 *
 * 4. **Audit rows never carry the value.** The redactor in lib/admin/audit.ts
 *    drops anything whose key looks like a secret, and the summaries below name
 *    the vendor and the action rather than the credential.
 */

/**
 * The columns a display path may see.
 *
 * Spelled out rather than `select('*')`, for rule 2 above.
 */
const DISPLAY_COLUMNS =
  'provider, label, key_prefix, last4, status, last_verified_at, last_error, rotated_at, created_at, updated_at, updated_by'

type DisplayRow = Pick<
  AppProviderKeyRow,
  | 'provider'
  | 'label'
  | 'key_prefix'
  | 'last4'
  | 'status'
  | 'last_verified_at'
  | 'last_error'
  | 'rotated_at'
  | 'created_at'
  | 'updated_at'
>

/** Where the key a generation would use actually comes from. */
export type KeySource = 'database' | 'environment' | 'none'

export interface AppProviderKey {
  provider: ProviderName
  label: string | null
  /** `sk-••••••••1234`. Built from fragments, never from a decrypted key. */
  masked: string
  status: ProviderKeyStatus
  lastVerifiedAt: string | null
  lastError: string | null
  rotatedAt: string | null
  updatedAt: string
}

function toKey(row: DisplayRow): AppProviderKey {
  return {
    provider: row.provider as ProviderName,
    label: row.label,
    masked: maskKey(row.key_prefix, row.last4),
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    rotatedAt: row.rotated_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Read — admin display
// ---------------------------------------------------------------------------

/** Every stored shared key, masked. Admin only. */
export async function listAppProviderKeys(): Promise<AppProviderKey[]> {
  if (!isKeyVaultConfigured) return []

  const { data, error } = await cmsAdminClient()
    .from('app_provider_keys')
    .select(DISPLAY_COLUMNS)
    .order('provider', { ascending: true })

  if (error) {
    console.error('[provider-keys.service] list failed:', error.message)
    return []
  }

  return (data ?? []).map((row) => toKey(row as unknown as DisplayRow))
}

/**
 * Where each provider's shared key comes from, for the admin table.
 *
 * The distinction matters operationally. A provider showing 'environment' has a
 * key that cannot be rotated from this screen, and one showing 'none' will refuse
 * generations for every user who has not connected their own — so the UI can say
 * which of those two an operator is looking at instead of one ambiguous "not
 * configured".
 *
 * Reads only the provider column, so this is cheap and touches no ciphertext.
 */
export async function appKeySources(): Promise<Record<string, KeySource>> {
  const sources: Record<string, KeySource> = {}

  const stored = new Set<string>()
  if (isKeyVaultConfigured) {
    const { data, error } = await cmsAdminClient().from('app_provider_keys').select('provider')
    if (error) console.error('[provider-keys.service] source read failed:', error.message)
    for (const row of data ?? []) stored.add(row.provider)
  }

  const { PROVIDERS } = await import('@/lib/ai/catalogue')
  for (const provider of PROVIDERS) {
    if (stored.has(provider.id)) {
      sources[provider.id] = 'database'
    } else if (serverProviderKey(provider.id)) {
      sources[provider.id] = 'environment'
    } else {
      sources[provider.id] = 'none'
    }
  }

  return sources
}

// ---------------------------------------------------------------------------
// Read — the generation path
// ---------------------------------------------------------------------------

/**
 * The shared key for each provider, database first and environment second.
 *
 * Returns plaintext, and is the only function in this file that decrypts. Called
 * from services/generation.service.ts with the providers a model can run on, so
 * it asks for what the router could use and nothing more.
 *
 * Every failure resolves to "no database key", which falls through to the
 * environment variable — the behaviour this app had before the table existed. A
 * key marked `invalid` is skipped for the same reason the user vault skips one: a
 * credential the vendor has already rejected is not worth a failed job and a
 * refund.
 */
export async function resolveSharedKeys(
  providers: ProviderName[],
): Promise<Partial<Record<ProviderName, string>>> {
  const resolved: Partial<Record<ProviderName, string>> = {}
  if (providers.length === 0) return resolved

  if (isKeyVaultConfigured && env.aiKeySecret) {
    try {
      const { data, error } = await cmsAdminClient()
        .from('app_provider_keys')
        .select('provider, ciphertext, status')
        .in('provider', providers)

      if (error) {
        console.error('[provider-keys.service] shared key read failed:', error.message)
      }

      for (const row of data ?? []) {
        if (row.status === 'invalid') continue
        const plaintext = open(row.ciphertext, env.aiKeySecret)
        if (!plaintext) {
          console.error(
            `[provider-keys.service] ciphertext for ${row.provider} would not open — AI_KEY_ENCRYPTION_SECRET may have changed.`,
          )
          continue
        }
        resolved[row.provider as ProviderName] = plaintext
      }
    } catch (cause) {
      console.error('[provider-keys.service] shared key read threw:', cause)
    }
  }

  // The environment fills every gap the table did not.
  for (const provider of providers) {
    if (resolved[provider]) continue
    const fromEnv = serverProviderKey(provider)
    if (fromEnv) resolved[provider] = fromEnv
  }

  return resolved
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function notConfigured(): AdminResult<never> {
  return {
    ok: false,
    error:
      'Key storage is unavailable: set AI_KEY_ENCRYPTION_SECRET and SUPABASE_SERVICE_ROLE_KEY.',
  }
}

/**
 * Stores a shared key, then verifies it.
 *
 * In that order, deliberately — the same decision `ai-keys.service.ts` makes for
 * the user vault. Verification is a network call to somebody else's service; if it
 * hangs or the deploy is torn down mid-request, an operator who pasted a good key
 * should not have to find it again. The row lands as `unverified` and the status is
 * patched when the answer arrives.
 */
export async function saveAppProviderKey(
  input: { provider: string; apiKey: string; label?: string | null },
  actor: AdminActor,
): Promise<AdminResult<AppProviderKey>> {
  if (!isKeyVaultConfigured || !env.aiKeySecret) return notConfigured()

  const descriptor = getProvider(input.provider)
  if (!descriptor) {
    return { ok: false, error: 'That provider is not supported.', field: 'provider' }
  }

  const rawKey = input.apiKey.trim()
  if (!rawKey) return { ok: false, error: 'Paste a key first.', field: 'apiKey' }

  const { prefix, last4 } = fragmentsOf(rawKey)

  let ciphertext: string
  try {
    ciphertext = seal(rawKey, env.aiKeySecret)
  } catch (cause) {
    console.error('[provider-keys.service] seal failed:', cause instanceof Error ? cause.message : cause)
    return { ok: false, error: 'Could not encrypt that key.' }
  }

  // Whether this is a rotation, for the audit summary and the timestamp. Read
  // before the write, and only the metadata — a rotation does not need to see
  // what it is replacing.
  const existing = await cmsAdminClient()
    .from('app_provider_keys')
    .select('provider, last4, status')
    .eq('provider', input.provider)
    .maybeSingle()

  const isRotation = Boolean(existing.data)

  const { data: saved, error } = await cmsAdminClient()
    .from('app_provider_keys')
    .upsert(
      {
        provider: input.provider,
        label: input.label?.trim() || null,
        ciphertext,
        key_prefix: prefix,
        last4,
        status: 'unverified' as ProviderKeyStatus,
        last_error: null,
        last_verified_at: null,
        rotated_at: isRotation ? new Date().toISOString() : null,
        updated_by: actor.id,
      },
      { onConflict: 'provider' },
    )
    .select(DISPLAY_COLUMNS)
    .single()

  if (error || !saved) {
    console.error('[provider-keys.service] upsert failed:', error?.message)
    return { ok: false, error: 'Could not save that key.' }
  }

  await audit({
    actor,
    action: isRotation ? 'rotate' : 'create',
    entity: 'provider_key',
    entityId: input.provider,
    summary: `${isRotation ? 'Rotated' : 'Stored'} the shared ${descriptor.label} key (ending ${last4 || '••••'})`,
    // The fragments only. There is no version of this row that belongs in a log,
    // and `diffOf` would redact `ciphertext` anyway — being explicit here means
    // nobody has to trust that it would.
    before: isRotation ? { last4: existing.data?.last4 ?? null } : null,
    after: { last4 },
  })

  const verified = await applyVerification(input.provider, rawKey)
  return { ok: true, data: verified ?? toKey(saved as unknown as DisplayRow) }
}

/** Re-checks a stored shared key against its vendor. */
export async function testAppProviderKey(
  provider: string,
  actor: AdminActor,
): Promise<AdminResult<AppProviderKey>> {
  if (!isKeyVaultConfigured || !env.aiKeySecret) return notConfigured()

  const descriptor = getProvider(provider)
  if (!descriptor) return { ok: false, error: 'That provider is not supported.' }

  const rawKey = await readKeyIncludingInvalid(provider)
  if (!rawKey) {
    return { ok: false, error: 'There is no shared key stored for that provider.' }
  }

  const result = await applyVerification(provider, rawKey)
  if (!result) return { ok: false, error: 'Could not update that key.' }

  await audit({
    actor,
    action: 'test',
    entity: 'provider_key',
    entityId: provider,
    summary: `Tested the shared ${descriptor.label} key — ${result.status}`,
    after: { status: result.status },
  })

  return { ok: true, data: result }
}

export async function deleteAppProviderKey(
  provider: string,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  if (!isKeyVaultConfigured) return notConfigured()

  const descriptor = getProvider(provider)

  const { error } = await cmsAdminClient()
    .from('app_provider_keys')
    .delete()
    .eq('provider', provider)

  if (error) {
    console.error('[provider-keys.service] delete failed:', error.message)
    return { ok: false, error: 'Could not remove that key.' }
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'provider_key',
    entityId: provider,
    summary: `Removed the shared ${descriptor?.label ?? provider} key. Generations now fall back to the environment variable, if one is set.`,
  })

  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Like `resolveSharedKeys` for one provider, but does not skip a key marked
 * invalid and does not fall back to the environment.
 *
 * "Test again" has to work on the key the vendor last rejected — that is the
 * whole reason somebody presses it after fixing a permission — and it must test
 * the stored key rather than silently testing the environment variable and
 * reporting a pass.
 */
async function readKeyIncludingInvalid(provider: string): Promise<string | null> {
  if (!env.aiKeySecret) return null

  const { data } = await cmsAdminClient()
    .from('app_provider_keys')
    .select('ciphertext')
    .eq('provider', provider)
    .maybeSingle()

  if (!data) return null
  return open(data.ciphertext, env.aiKeySecret)
}

/** Runs verification and writes the result back. Returns the fresh masked row. */
async function applyVerification(
  provider: string,
  rawKey: string,
): Promise<AppProviderKey | null> {
  const result = await verifyProviderKey(provider as ProviderName, rawKey)

  const { data, error } = await cmsAdminClient()
    .from('app_provider_keys')
    .update({
      status: result.status,
      // Only a real answer sets the timestamp. "We could not reach them" is not a
      // verification, and a stale tick beside it would read as one.
      last_verified_at: result.status === 'valid' ? new Date().toISOString() : null,
      last_error: result.status === 'valid' ? null : result.message,
    })
    .eq('provider', provider)
    .select(DISPLAY_COLUMNS)
    .single()

  if (error || !data) {
    console.error('[provider-keys.service] status write failed:', error?.message)
    return null
  }

  return toKey(data as unknown as DisplayRow)
}
