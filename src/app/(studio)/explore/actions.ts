'use server'

import { revalidatePath } from 'next/cache'

import { toggleLike } from '@/services/explore.service'
import { setGenerationVisibility } from '@/services/generation.service'
import type { ActionResult } from '@/app/(studio)/projects/actions'
import type { GenerationVisibility } from '@/types/database'

/**
 * Explore Server Actions.
 *
 * Likes deliberately do not revalidate anything: the feed updates optimistically
 * from the count this returns, and re-rendering a grid of media because one
 * heart moved would be a worse experience than the one it is trying to fix.
 */
export async function toggleLikeAction(
  generationId: string,
): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  const result = await toggleLike(generationId)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: { liked: result.liked, likeCount: result.likeCount } }
}

/**
 * Publishing changes what the feed contains and what the library badges say,
 * so unlike a like, this one does revalidate.
 */
export async function setVisibilityAction(
  generationId: string,
  visibility: GenerationVisibility,
): Promise<ActionResult<{ id: string; visibility: GenerationVisibility }>> {
  const result = await setGenerationVisibility(generationId, visibility)
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/explore')
  revalidatePath('/library')
  revalidatePath(`/g/${generationId}`)
  revalidatePath('/')

  return { ok: true, data: result.data }
}
