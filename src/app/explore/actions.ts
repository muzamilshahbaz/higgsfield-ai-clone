'use server'

import { revalidatePath } from 'next/cache'

import { normaliseCategories } from '@/lib/categories'
import { RATE_LIMITS } from '@/lib/constants'
import { actionKey, rateLimit } from '@/lib/rate-limit'
import { addComment, deleteComment } from '@/services/comment.service'
import {
  registerDownload,
  setGenerationCategories,
  toggleFavourite,
  toggleLike,
} from '@/services/explore.service'
import { setGenerationVisibility } from '@/services/generation.service'
import type { ActionResult } from '@/app/(studio)/projects/actions'
import type { ExploreCategorySlug, GenerationVisibility } from '@/types/database'

/**
 * Explore Server Actions.
 *
 * Every one of these is a write, and every one is rate limited and
 * authorised by the service it calls — none of them trust an id from the
 * client for anything other than naming a row. The counters they move are
 * updated inside SECURITY DEFINER functions, so a caller can never write a
 * count directly.
 *
 * Engagement actions deliberately do not revalidate anything: the feed updates
 * optimistically from the numbers they return, and re-rendering a grid of
 * media because one heart moved would be a worse experience than the one it is
 * trying to fix. The actions that change *what the feed contains* — publishing
 * and retagging — do revalidate.
 */

export async function toggleLikeAction(
  generationId: string,
): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  // A like is one row and one counter, but a held-down key should not write
  // hundreds of them. The message says when, not just no.
  const quota = rateLimit(await actionKey(), RATE_LIMITS.likes)
  if (!quota.ok) {
    return { ok: false, error: `Easy — try again in ${quota.retryAfterSec}s.` }
  }

  const result = await toggleLike(generationId)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: { liked: result.liked, likeCount: result.likeCount } }
}

export async function toggleFavouriteAction(
  generationId: string,
): Promise<ActionResult<{ favourited: boolean; favouriteCount: number }>> {
  const quota = rateLimit(await actionKey(), RATE_LIMITS.favourites)
  if (!quota.ok) {
    return { ok: false, error: `Easy — try again in ${quota.retryAfterSec}s.` }
  }

  const result = await toggleFavourite(generationId)
  if (!result.ok) return { ok: false, error: result.error }

  // The Favourites page is a list whose membership just changed, so unlike a
  // like this one does have a page to invalidate.
  revalidatePath('/favourites')

  return {
    ok: true,
    data: { favourited: result.favourited, favouriteCount: result.favouriteCount },
  }
}

/**
 * Counts a download.
 *
 * Separate from the act of saving the file, which happens in the browser: the
 * button fetches the media itself and only tells the server afterwards. A
 * failed count therefore never costs the user their download, which is why
 * every caller ignores the result.
 */
export async function registerDownloadAction(
  generationId: string,
): Promise<ActionResult<{ downloadCount: number }>> {
  const quota = rateLimit(await actionKey(), RATE_LIMITS.downloads)
  if (!quota.ok) {
    return { ok: false, error: `Easy — try again in ${quota.retryAfterSec}s.` }
  }

  const result = await registerDownload(generationId)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: { downloadCount: result.downloadCount } }
}

export async function addCommentAction(
  generationId: string,
  body: string,
  parentId?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const quota = rateLimit(await actionKey(), RATE_LIMITS.comments)
  if (!quota.ok) {
    return { ok: false, error: `Slow down — try again in ${quota.retryAfterSec}s.` }
  }

  const result = await addComment(generationId, body, parentId)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: result.data }
}

export async function deleteCommentAction(
  commentId: string,
): Promise<ActionResult<{ id: string; removed: number }>> {
  const quota = rateLimit(await actionKey(), RATE_LIMITS.comments)
  if (!quota.ok) {
    return { ok: false, error: `Slow down — try again in ${quota.retryAfterSec}s.` }
  }

  const result = await deleteComment(commentId)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: result.data }
}

/**
 * Publishing changes what the feed contains and what the library badges say,
 * so unlike a like, this one does revalidate.
 *
 * Categories travel with the visibility change rather than needing a second
 * call: the publish dialog asks for both at once, and a shot that went public
 * untagged before its tags landed would appear in Explore under nothing.
 */
export async function setVisibilityAction(
  generationId: string,
  visibility: GenerationVisibility,
  categories?: readonly string[],
): Promise<
  ActionResult<{
    id: string
    visibility: GenerationVisibility
    categories: ExploreCategorySlug[]
  }>
> {
  let saved: ExploreCategorySlug[] | null = null

  // Tags first. If this fails the shot stays where it is, which is the
  // recoverable order — the alternative publishes it untagged and then
  // reports an error about something the user can no longer see.
  if (categories) {
    const clean = normaliseCategories(categories)
    const tagged = await setGenerationCategories(generationId, clean)
    if (!tagged.ok) return { ok: false, error: tagged.error }
    saved = tagged.categories
  }

  const result = await setGenerationVisibility(generationId, visibility)
  if (!result.ok) return { ok: false, error: result.error }

  revalidateSocialSurfaces(generationId)

  return {
    ok: true,
    data: { id: result.data.id, visibility: result.data.visibility, categories: saved ?? [] },
  }
}

/** Retags a shot without touching whether it is published. */
export async function setCategoriesAction(
  generationId: string,
  categories: readonly string[],
): Promise<ActionResult<{ id: string; categories: ExploreCategorySlug[] }>> {
  const result = await setGenerationCategories(generationId, normaliseCategories(categories))
  if (!result.ok) return { ok: false, error: result.error }

  revalidateSocialSurfaces(generationId)

  return { ok: true, data: { id: generationId, categories: result.categories } }
}

/** Every surface whose contents depend on what is published and how it is tagged. */
function revalidateSocialSurfaces(generationId: string) {
  revalidatePath('/explore')
  revalidatePath('/library')
  revalidatePath('/favourites')
  revalidatePath('/settings')
  revalidatePath(`/g/${generationId}`)
  revalidatePath('/')
}
