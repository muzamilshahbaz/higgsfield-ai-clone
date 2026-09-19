import 'server-only'

import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { ProjectRow } from '@/types/database'

/**
 * Project reads plus the default-project guarantee.
 *
 * Phase 1 needs only the read side and `ensureDefaultProject`, which the
 * composer depends on so it never blocks on project setup. Full CRUD lands
 * in Phase 4.
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
