'use server'

import { revalidatePath } from 'next/cache'

import { deleteGeneration, moveGenerationToProject } from '@/services/generation.service'
import type { ActionResult } from '@/app/(studio)/projects/actions'

/**
 * Generation Server Actions — the library's management verbs.
 *
 * Shared by the library grid, a project's own grid and the history table:
 * all three render the same detail drawer, so all three get the same
 * behaviour and there is one place where a delete is defined.
 */

/** Every surface that counts or lists generations. */
function revalidateLibrary(projectId?: string | null) {
  revalidatePath('/library')
  revalidatePath('/history')
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function deleteGenerationAction(
  generationId: string,
  projectId?: string | null,
): Promise<ActionResult<{ id: string; assetsRemoved: number }>> {
  const result = await deleteGeneration(generationId)
  if (!result.ok) return { ok: false, error: result.error }

  revalidateLibrary(projectId)
  return { ok: true, data: result.data }
}

export async function moveGenerationAction(
  generationId: string,
  projectId: string | null,
): Promise<ActionResult<{ id: string; projectId: string | null }>> {
  const result = await moveGenerationToProject(generationId, projectId)
  if (!result.ok) return { ok: false, error: result.error }

  revalidateLibrary(projectId)
  return { ok: true, data: { id: result.data.id, projectId: result.data.project_id } }
}
