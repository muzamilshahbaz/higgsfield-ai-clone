import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AssetKind, AssetRow, ProjectRow } from '@/types/database'

/**
 * Projects and generated assets, from the operator's side.
 *
 * Both are owner-scoped everywhere else in the app, which is why these reads go
 * through the service role and each one states its own filter.
 *
 * Almost entirely read-only, and that is a decision rather than an omission. A
 * project is one person's filing, and an operator reorganising somebody's folders
 * is not support — it is vandalism with good intentions. The two writes that do
 * exist are the ones an operator genuinely needs: restoring a project somebody
 * archived by accident, and removing an asset that should not be on the disk.
 */

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectRowWithOwner extends ProjectRow {
  ownerHandle: string | null
  ownerEmail: string | null
  generationCount: number
}

export interface ProjectQuery {
  search?: string
  includeDeleted?: boolean
  limit?: number
  offset?: number
}

/**
 * Projects with their owner and a generation count.
 *
 * Three queries rather than a join: `profiles` and `generations` are separate
 * tables with no PostgREST relationship declared in the schema map (see the note
 * on `Relationships` in types/database.ts), and adding one for an admin list is a
 * schema change for a convenience. Two extra round trips on one paginated page is
 * the cheaper trade.
 */
export async function listProjects(
  query: ProjectQuery = {},
): Promise<{ projects: ProjectRowWithOwner[]; total: number }> {
  const { search, includeDeleted = false, limit = 40, offset = 0 } = query
  const admin = createAdminClient()

  let builder = admin.from('projects').select('*', { count: 'exact' })
  if (!includeDeleted) builder = builder.is('deleted_at', null)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`title.ilike.${pattern},description.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[library.service] listProjects failed:', error.message)
    return { projects: [], total: 0 }
  }

  const rows = data ?? []
  if (rows.length === 0) return { projects: [], total: count ?? 0 }

  const ownerIds = [...new Set(rows.map((row) => row.user_id))]
  const ids = rows.map((row) => row.id)

  const [owners, generations] = await Promise.all([
    admin.from('profiles').select('id, handle, email').in('id', ownerIds),
    admin.from('generations').select('project_id').in('project_id', ids).is('deleted_at', null),
  ])

  const ownerById = new Map((owners.data ?? []).map((row) => [row.id, row]))
  const counts = new Map<string, number>()
  for (const row of generations.data ?? []) {
    if (!row.project_id) continue
    counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1)
  }

  return {
    projects: rows.map((row) => ({
      ...row,
      ownerHandle: ownerById.get(row.user_id)?.handle ?? null,
      ownerEmail: ownerById.get(row.user_id)?.email ?? null,
      generationCount: counts.get(row.id) ?? 0,
    })),
    total: count ?? 0,
  }
}

/**
 * Un-archives a project.
 *
 * The only project write an operator gets, because it is the only one that
 * undoes a user's mistake rather than overriding their choice. The reverse —
 * archiving somebody's project for them — is deliberately absent.
 */
export async function restoreProject(
  id: string,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('projects')
    .select('id, title, user_id, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (!before) return { ok: false, error: 'That project no longer exists.' }
  if (!before.deleted_at) return { ok: false, error: 'That project is not archived.' }

  const { error } = await admin.from('projects').update({ deleted_at: null }).eq('id', id)

  if (error) {
    console.error('[library.service] restoreProject failed:', error.message)
    return { ok: false, error: 'Could not restore that project.' }
  }

  await audit({
    actor,
    action: 'restore',
    entity: 'project',
    entityId: id,
    summary: `Restored the project “${before.title}”`,
    before: { deleted_at: before.deleted_at },
    after: { deleted_at: null },
  })

  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface AssetRowWithContext extends AssetRow {
  ownerHandle: string | null
  prompt: string | null
  generationStatus: string | null
  visibility: string | null
}

export interface AssetQuery {
  kind?: AssetKind
  search?: string
  limit?: number
  offset?: number
}

/**
 * Every generated file, with the job and owner it belongs to.
 *
 * `search` matches the prompt, which means resolving generations first and then
 * filtering assets by their ids — PostgREST cannot filter a table by a pattern on
 * a table it is not joined to. Without a search it is one query and a lookup.
 */
export async function listAssets(
  query: AssetQuery = {},
): Promise<{ assets: AssetRowWithContext[]; total: number }> {
  const { kind, search, limit = 48, offset = 0 } = query
  const admin = createAdminClient()

  let generationIds: string[] | null = null

  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    const { data: matches, error } = await admin
      .from('generations')
      .select('id')
      .or(`prompt.ilike.${pattern},author_handle.ilike.${pattern}`)
      // Bounded: this narrows a filter, and a search matching more than this many
      // jobs is a search that needs refining rather than a page that needs to be
      // longer.
      .limit(500)

    if (error) {
      console.error('[library.service] asset search failed:', error.message)
      return { assets: [], total: 0 }
    }

    generationIds = (matches ?? []).map((row) => row.id)
    if (generationIds.length === 0) return { assets: [], total: 0 }
  }

  let builder = admin.from('assets').select('*', { count: 'exact' })
  if (kind) builder = builder.eq('kind', kind)
  if (generationIds) builder = builder.in('generation_id', generationIds)

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[library.service] listAssets failed:', error.message)
    return { assets: [], total: 0 }
  }

  const rows = data ?? []
  if (rows.length === 0) return { assets: [], total: count ?? 0 }

  const [owners, generations] = await Promise.all([
    admin.from('profiles').select('id, handle').in('id', [...new Set(rows.map((row) => row.user_id))]),
    admin
      .from('generations')
      .select('id, prompt, status, visibility')
      .in('id', [...new Set(rows.map((row) => row.generation_id))]),
  ])

  const handleById = new Map((owners.data ?? []).map((row) => [row.id, row.handle]))
  const jobById = new Map((generations.data ?? []).map((row) => [row.id, row]))

  return {
    assets: rows.map((row) => {
      const job = jobById.get(row.generation_id)
      return {
        ...row,
        ownerHandle: handleById.get(row.user_id) ?? null,
        prompt: job?.prompt ?? null,
        generationStatus: job?.status ?? null,
        visibility: job?.visibility ?? null,
      }
    }),
    total: count ?? 0,
  }
}

/**
 * Removes one asset: the storage object, then the row.
 *
 * Object first so a failure leaves a row pointing at bytes that still exist, which
 * is recoverable, rather than bytes nothing references, which is not findable. The
 * row delete is what the operator asked for and it happens either way — the same
 * order and the same reasoning as the owner's own delete path in asset.service.ts.
 */
export async function deleteAsset(id: string, actor: AdminActor): Promise<AdminResult<null>> {
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('assets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!before) return { ok: false, error: 'That file no longer exists.' }

  if (before.storage_path) {
    const { error: removeError } = await admin.storage
      .from('generations')
      .remove([before.storage_path])
    if (removeError) {
      console.error('[library.service] object removal failed:', removeError.message)
    }
  }

  const { error } = await admin.from('assets').delete().eq('id', id)

  if (error) {
    console.error('[library.service] deleteAsset failed:', error.message)
    return { ok: false, error: 'Could not delete that file.' }
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'asset',
    entityId: id,
    summary: `Deleted a ${before.kind} from generation ${before.generation_id}`,
    before: { kind: before.kind, url: before.url, storage_path: before.storage_path },
  })

  return { ok: true, data: null }
}
