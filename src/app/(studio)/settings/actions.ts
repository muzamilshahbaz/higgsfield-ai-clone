'use server'

import { revalidatePath } from 'next/cache'

import { updateProfileSchema } from '@/lib/validation/profile'
import { updateMyProfile, type Profile } from '@/services/profile.service'
import type { ActionResult } from '@/app/(studio)/projects/actions'

/**
 * Profile Server Action.
 *
 * The handle is lowercased by the schema before it reaches the service,
 * because `profiles_handle_lower_key` compares case-insensitively — storing
 * "Ada" while "ada" exists would fail at the index rather than at validation.
 */
export async function updateProfileAction(input: {
  displayName?: string
  handle: string
}): Promise<ActionResult<Profile>> {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the form.',
      field: String(issue?.path[0] ?? ''),
    }
  }

  const result = await updateMyProfile({
    displayName: parsed.data.displayName?.trim() || null,
    handle: parsed.data.handle,
  })

  if (!result.ok) return { ok: false, error: result.error, field: result.field }

  // The topbar's avatar and the author byline on new generations both read
  // this, so the whole shell needs re-rendering, not just this page.
  revalidatePath('/', 'layout')
  return { ok: true, data: result.profile }
}
