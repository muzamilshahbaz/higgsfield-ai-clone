'use server'

import { revalidatePath } from 'next/cache'

import { asString, type RecordValues } from '@/components/admin/form-spec'
import { withCapability, type AdminResult } from '@/lib/admin/guard'
import { deleteAsset, restoreProject } from '@/services/admin/library.service'
import {
  approveShot,
  deleteComment,
  deleteShot,
  hideShot,
  setCommentHidden,
  setShotFeatured,
} from '@/services/admin/moderation.service'

/**
 * Explore moderation, assets and projects.
 *
 * Every one of these changes something a visitor can see, so they all revalidate the
 * public surfaces as well as the admin screen: the feed, the permalink for the shot
 * in question, and the homepage — whose showcase reads the public feed.
 *
 * The permalink matters most. A moderator who hides a shot and then finds it still
 * loading at its own URL will assume the hide did not work, when what happened is
 * that a cached route was not invalidated.
 */

function revalidateFeed(generationId?: string) {
  revalidatePath('/admin/explore')
  revalidatePath('/explore')
  revalidatePath('/')
  if (generationId) revalidatePath(`/g/${generationId}`)
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

export async function hideGeneration(
  id: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const note = asString(values.note)
    if (!note) {
      return {
        ok: false,
        error: 'Say why. The note is what the next moderator sees in the audit trail.',
        field: 'note',
      }
    }

    const result = await hideShot(id, note, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateFeed(id)
    return { ok: true, data: null }
  })
}

export async function publishGeneration(id: string): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const result = await approveShot(id, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateFeed(id)
    return { ok: true, data: null }
  })
}

export async function featureGeneration(
  id: string,
  featured: boolean,
): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const result = await setShotFeatured(id, featured, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateFeed(id)
    return { ok: true, data: null }
  })
}

export async function removeGeneration(
  id: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const reason = asString(values.reason)
    if (!reason) {
      return { ok: false, error: 'Say why this is being removed.', field: 'reason' }
    }

    const result = await deleteShot(id, reason, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateFeed(id)
    revalidatePath('/admin/assets')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function hideComment(id: string, hidden: boolean): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const result = await setCommentHidden(id, hidden, actor)
    if (!result.ok) return { ok: false, error: result.error }

    // The thread is rendered on the permalink and inside the feed's dialog, and the
    // generation id is not in hand here — so the feed and the admin list are the
    // surfaces to invalidate, and the permalink picks the change up on its own
    // revalidation.
    revalidatePath('/admin/explore')
    revalidatePath('/explore')
    return { ok: true, data: null }
  })
}

/**
 * Deletes a comment outright.
 *
 * Hiding is the reversible option and what the UI leads with. This exists for the
 * cases where the content itself must not stay in the database — and the audit row
 * keeps the body, because after this there is nothing left to read.
 */
export async function removeComment(id: string): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const result = await deleteComment(id, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidatePath('/admin/explore')
    revalidatePath('/explore')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Assets and projects
// ---------------------------------------------------------------------------

export async function removeAsset(id: string): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const result = await deleteAsset(id, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidatePath('/admin/assets')
    revalidatePath('/explore')
    return { ok: true, data: null }
  })
}

export async function unarchiveProject(id: string): Promise<AdminResult<null>> {
  return withCapability('moderation:write', async (actor) => {
    const result = await restoreProject(id, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidatePath('/admin/projects')
    return { ok: true, data: null }
  })
}
