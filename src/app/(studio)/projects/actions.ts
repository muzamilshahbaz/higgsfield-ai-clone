'use server'

import { revalidatePath } from 'next/cache'

import { RATE_LIMITS } from '@/lib/constants'
import { actionKey, rateLimit } from '@/lib/rate-limit'
import { createProjectSchema, updateProjectSchema } from '@/lib/validation/project'
import { getGeneration } from '@/services/generation.service'
import {
  createProject,
  deleteProject,
  updateProject,
  type Project,
  type ProjectDeletion,
} from '@/services/project.service'

/**
 * Project Server Actions.
 *
 * Every one returns a plain result rather than throwing, because the callers
 * are dialogs: a thrown error would unmount the panel and lose what the user
 * typed, where a returned message can be rendered under the field.
 *
 * Validation runs here as well as in the dialog. The dialog's copy is the same
 * schema, so the two can never disagree, and a client that skipped it still
 * cannot write a title Postgres would reject.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string }

/** The pages a project change is visible on. */
function revalidateProjects(projectId?: string) {
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function createProjectAction(input: {
  title: string
  description?: string
}): Promise<ActionResult<Project>> {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the form.', field: String(issue?.path[0] ?? '') }
  }

  const quota = rateLimit(await actionKey(), RATE_LIMITS.projects)
  if (!quota.ok) {
    return { ok: false, error: `That is a lot of projects at once. Try again in ${quota.retryAfterSec}s.` }
  }

  const result = await createProject(parsed.data)
  if (!result.ok) return { ok: false, error: result.error }

  revalidateProjects()
  return { ok: true, data: result.data }
}

export async function updateProjectAction(input: {
  id: string
  title?: string
  description?: string
}): Promise<ActionResult<Project>> {
  const parsed = updateProjectSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the form.', field: String(issue?.path[0] ?? '') }
  }

  const result = await updateProject(parsed.data)
  if (!result.ok) return { ok: false, error: result.error }

  revalidateProjects(result.data.id)
  return { ok: true, data: result.data }
}

export async function deleteProjectAction(id: string): Promise<ActionResult<ProjectDeletion>> {
  const result = await deleteProject(id)
  if (!result.ok) return { ok: false, error: result.error }

  revalidateProjects(id)
  revalidatePath('/library')
  return { ok: true, data: result.data }
}

/**
 * Uses a generation's own media as the project cover.
 *
 * The URL is resolved server-side from the generation id rather than accepted
 * from the client, so a cover can only ever be something the caller can
 * already see — `getGeneration` reads through RLS.
 */
export async function setProjectCoverAction(
  projectId: string,
  generationId: string,
): Promise<ActionResult<Project>> {
  const generation = await getGeneration(generationId)
  if (!generation) return { ok: false, error: 'That generation is gone.' }

  const media = generation.assets.find((asset) => asset.kind !== 'poster') ?? generation.assets[0]
  if (!media) return { ok: false, error: 'That generation has no media to use as a cover.' }

  const result = await updateProject({ id: projectId, coverUrl: media.url })
  if (!result.ok) return { ok: false, error: result.error }

  revalidateProjects(projectId)
  return { ok: true, data: result.data }
}

/** Clears a cover, so the project falls back to its newest shot. */
export async function clearProjectCoverAction(projectId: string): Promise<ActionResult<Project>> {
  const result = await updateProject({ id: projectId, coverUrl: null })
  if (!result.ok) return { ok: false, error: result.error }

  revalidateProjects(projectId)
  return { ok: true, data: result.data }
}
