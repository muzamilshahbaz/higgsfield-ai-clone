import 'server-only'

import { isServiceRoleConfigured } from '@/lib/env'
import type { CreateProjectInput, UpdateProjectInput } from '@/lib/validation/project'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { ProjectRow } from '@/types/database'

/**
 * Projects — the containers a generation is filed into.
 *
 * Writes go through the user's own client rather than the admin one: a
 * project row carries nothing the user is not allowed to set, so RLS
 * (`projects_*_own` in 0003_rls.sql) is both the scope and the guard, and no
 * `where user_id` clause can be forgotten. The single exception is the soft
 * delete, for the reason spelled out on `deleteProject`.
 *
 * Deletion is soft — `deleted_at` — because the generations that pointed at a
 * project outlive it. They are moved to the default project first, so nothing
 * is ever orphaned into a container the user can no longer open.
 */

export type Project = ProjectRow

/** The signed-in user's projects, newest first, default pinned to the top. */
export async function listMyProjects(): Promise<Project[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[project.service] listMyProjects failed:', error.message)
    return []
  }
  return data ?? []
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[project.service] getProject failed:', error.message)
    return null
  }
  return data
}

/**
 * Returns the user's default project id, creating one if the signup trigger
 * somehow did not. Backed by the `ensure_default_project` SQL function so the
 * "find or create" is a single atomic round trip rather than a race.
 */
export async function ensureDefaultProject(): Promise<string | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ensure_default_project', { p_user_id: user.id })

  if (error) {
    console.error('[project.service] ensureDefaultProject failed:', error.message)
    return null
  }
  return data
}

/** How many projects the user owns — for the dashboard stat tiles. */
export async function countMyProjects(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (error) {
    console.error('[project.service] countMyProjects failed:', error.message)
    return 0
  }
  return count ?? 0
}

// ---------------------------------------------------------------------------
// The grid's view of a project
// ---------------------------------------------------------------------------

export interface ProjectSummary extends Project {
  /** Exact number of live generations filed here. */
  generationCount: number
  /** `cover_url` when set, otherwise the newest finished shot in the project. */
  previewUrl: string | null
  /** True when the preview needs a video element rather than an image. */
  previewIsVideo: boolean
  /** Newest finished shot's timestamp, for "last worked on". */
  lastActivityAt: string | null
}

interface ProjectPreview {
  url: string
  isVideo: boolean
  createdAt: string
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)(\?|$)/i.test(url)
}

/**
 * Projects decorated with a count and a cover.
 *
 * Counts are exact, one head query per project — a user has a handful of
 * projects, not thousands, so the round trips are cheap, and correct beats
 * approximate on a number the reader can check by opening the project.
 *
 * Previews come from one shared query over the newest finished work instead,
 * because a fallback cover is decoration: a project whose newest shot falls
 * outside that window just shows its placeholder until a cover is set.
 */
export async function listMyProjectSummaries(): Promise<ProjectSummary[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const projects = await listMyProjects()
  if (projects.length === 0) return []

  const supabase = await createClient()

  const [counts, previews] = await Promise.all([
    Promise.all(
      projects.map(async (project) => {
        const { count, error } = await supabase
          .from('generations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('project_id', project.id)
          .is('deleted_at', null)

        if (error) {
          console.error('[project.service] project count failed:', error.message)
          return 0
        }
        return count ?? 0
      }),
    ),
    newestMediaByProject(user.id),
  ])

  return projects.map((project, index) => {
    const preview = previews.get(project.id)
    return {
      ...project,
      generationCount: counts[index] ?? 0,
      previewUrl: project.cover_url ?? preview?.url ?? null,
      previewIsVideo: project.cover_url
        ? isVideoUrl(project.cover_url)
        : (preview?.isVideo ?? false),
      lastActivityAt: preview?.createdAt ?? null,
    }
  })
}

/** First finished asset per project, drawn from the user's newest work. */
async function newestMediaByProject(userId: string): Promise<Map<string, ProjectPreview>> {
  const found = new Map<string, ProjectPreview>()
  const supabase = await createClient()

  // Owner-scoped for the same reason as the reads in generation.service: the
  // public select policy would otherwise spend this 80-row window on other
  // people's Explore posts and starve the user's own projects of a cover.
  const { data, error } = await supabase
    .from('generations')
    .select('id, project_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .is('deleted_at', null)
    .not('project_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(80)

  if (error) {
    console.error('[project.service] preview lookup failed:', error.message)
    return found
  }

  const rows = data ?? []
  if (rows.length === 0) return found

  const { data: assets, error: assetError } = await supabase
    .from('assets')
    .select('generation_id, url, mime_type, kind, sort_order')
    .in(
      'generation_id',
      rows.map((row) => row.id),
    )
    .order('sort_order', { ascending: true })

  if (assetError) {
    console.error('[project.service] preview assets failed:', assetError.message)
    return found
  }

  const byGeneration = new Map<string, { url: string; isVideo: boolean }>()
  for (const asset of assets ?? []) {
    if (asset.kind === 'poster' || byGeneration.has(asset.generation_id)) continue
    byGeneration.set(asset.generation_id, {
      url: asset.url,
      isVideo: (asset.mime_type ?? '').startsWith('video/'),
    })
  }

  // `rows` is already newest-first, so the first hit per project wins.
  for (const row of rows) {
    if (!row.project_id || found.has(row.project_id)) continue
    const media = byGeneration.get(row.id)
    if (!media) continue
    found.set(row.project_id, { ...media, createdAt: row.created_at })
  }

  return found
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type ProjectMutation<T> = { ok: true; data: T } | { ok: false; error: string }

/** Not a schema constraint; it stops the grid quietly becoming a list. */
export const MAX_PROJECTS = 50

export async function createProject(input: CreateProjectInput): Promise<ProjectMutation<Project>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const existing = await countMyProjects()
  if (existing >= MAX_PROJECTS) {
    return { ok: false, error: `You already have ${MAX_PROJECTS} projects. Delete one first.` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      title: input.title,
      description: input.description?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[project.service] createProject failed:', error?.message)
    return { ok: false, error: 'Could not create that project. Try again.' }
  }
  return { ok: true, data }
}

export async function updateProject(input: UpdateProjectInput): Promise<ProjectMutation<Project>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  // Typed as the row's own partial so a mistyped column is a compile error
  // rather than a silently ignored update.
  const patch: Partial<Project> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description.trim() || null
  if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl || null

  if (Object.keys(patch).length === 0) {
    const project = await getProject(input.id)
    return project ? { ok: true, data: project } : { ok: false, error: 'That project is gone.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', input.id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[project.service] updateProject failed:', error.message)
    return { ok: false, error: 'Could not save that project. Try again.' }
  }
  // RLS turns "someone else's project" into zero rows rather than an error.
  if (!data) return { ok: false, error: 'That project is gone.' }

  return { ok: true, data }
}

export interface ProjectDeletion {
  title: string
  /** Generations rehomed into the default project rather than orphaned. */
  moved: number
}

export async function deleteProject(id: string): Promise<ProjectMutation<ProjectDeletion>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  if (!isServiceRoleConfigured) {
    return { ok: false, error: 'Deleting is unavailable: SUPABASE_SERVICE_ROLE_KEY is not set.' }
  }

  const project = await getProject(id)
  if (!project) return { ok: false, error: 'That project is gone.' }

  if (project.is_default) {
    return {
      ok: false,
      error: 'The default project is where loose work lands, so it cannot be deleted.',
    }
  }

  const supabase = await createClient()

  // The work moves before the container disappears, so a generation is never
  // left pointing at a project its owner can no longer open.
  const defaultProjectId = await ensureDefaultProject()
  let moved = 0

  if (defaultProjectId) {
    const { data: rehomed, error: moveError } = await supabase
      .from('generations')
      .update({ project_id: defaultProjectId })
      .eq('project_id', id)
      .is('deleted_at', null)
      .select('id')

    if (moveError) {
      console.error('[project.service] could not rehome generations:', moveError.message)
      return { ok: false, error: 'Could not move that work. Nothing was deleted.' }
    }
    moved = rehomed?.length ?? 0
  }

  // The one write in this file that cannot go through the user's client.
  //
  // PostgREST wraps every UPDATE in a RETURNING clause, so Postgres checks the
  // SELECT policies against the *new* row. `projects_select_own` requires
  // `deleted_at is null`, which means the moment this update sets it the row
  // stops being visible to its owner and the statement is rejected with "new
  // row violates row-level security policy". Soft delete is simply not
  // expressible from a user-scoped client under that policy.
  //
  // The admin client bypasses RLS, so the `user_id` filter is doing the
  // scoping a policy would otherwise do. It is not redundant.
  const admin = createAdminClient()
  const { error } = await admin
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) {
    console.error('[project.service] deleteProject failed:', error.message)
    return { ok: false, error: 'Could not delete that project. Try again.' }
  }

  return { ok: true, data: { title: project.title, moved } }
}
