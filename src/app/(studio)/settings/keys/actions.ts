'use server'

import { revalidatePath } from 'next/cache'

import { providerOnlySchema, saveProviderKeySchema } from '@/lib/validation/ai-key'
import {
  deleteProviderKey,
  saveProviderKey,
  testProviderKey,
  type ProviderConnection,
} from '@/services/ai-keys.service'
import type { ActionResult } from '@/app/(studio)/projects/actions'
import type { ProviderName } from '@/types/database'

/**
 * Provider key Server Actions.
 *
 * The same `ActionResult` contract as the project and profile actions: these
 * are called from a dialog, and a thrown error would unmount the panel and
 * lose the key someone just pasted.
 *
 * One rule specific to this file: no action returns a key, and no action
 * takes one back out. Input flows one way — plaintext in, masked metadata
 * out — so there is no code path where a stored credential reaches a client
 * component, even by accident.
 */

export async function saveProviderKeyAction(input: {
  provider: string
  apiKey: string
  label?: string
}): Promise<ActionResult<ProviderConnection>> {
  const parsed = saveProviderKeySchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the form.',
      field: String(issue?.path[0] ?? ''),
    }
  }

  const result = await saveProviderKey({
    provider: parsed.data.provider as ProviderName,
    apiKey: parsed.data.apiKey,
    label: parsed.data.label || null,
  })

  if (!result.ok) {
    // A validation failure belongs under the input; anything else is a
    // condition of the whole page and belongs in a toast.
    return {
      ok: false,
      error: result.message,
      field: result.code === 'UNKNOWN_PROVIDER' ? 'provider' : undefined,
    }
  }

  revalidatePath('/settings/keys')
  return { ok: true, data: result.data }
}

export async function testProviderKeyAction(input: {
  provider: string
}): Promise<ActionResult<ProviderConnection>> {
  const parsed = providerOnlySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a provider you can connect.' }

  const result = await testProviderKey(parsed.data.provider as ProviderName)
  if (!result.ok) return { ok: false, error: result.message }

  revalidatePath('/settings/keys')
  return { ok: true, data: result.data }
}

export async function deleteProviderKeyAction(input: {
  provider: string
}): Promise<ActionResult<null>> {
  const parsed = providerOnlySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a provider you can connect.' }

  const result = await deleteProviderKey(parsed.data.provider as ProviderName)
  if (!result.ok) return { ok: false, error: result.message }

  revalidatePath('/settings/keys')
  return { ok: true, data: null }
}
