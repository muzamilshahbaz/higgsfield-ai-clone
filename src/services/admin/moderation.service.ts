import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  AssetRow,
  CommentRow,
  ContentModerationStatus,
  GenerationRow,
  GenerationStatus,
  GenerationVisibility,
} from '@/types/database'

/**
 * Explore moderation.
 *
 * The design decision worth stating: hiding a shot does not add a filter to the
 * Explore feed. It sets `visibility = 'private'`, which is the predicate the feed
 * and the permalink route already enforce — and it records `moderation_status =
 * 'hidden'` alongside as the reason.
 *
 * That is deliberate. Adding a third condition to every read path would mean
 * touching the feed query, the permalink, the RLS policy on `generations`, the one
 * on `assets`, and the sitemap — five places where a moderation flag could be
 * forgotten. Reusing the mechanism that already works everywhere means a hidden
 * shot is hidden everywhere on day one, and `moderation_status` is a column the
 * admin panel reads rather than a column the product depends on.
 *
 * Comments are the other way round, because there is no existing mechanism: they
 * get `is_hidden` and services/comment.service.ts filters on it. A hide is
 * reversible and leaves `comment_count` honest about what was said, which a delete
 * would not.
 */

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

export interface ShotRow extends GenerationRow {
  assets: AssetRow[]
}

export interface ShotQuery {
  search?: string
  visibility?: GenerationVisibility
  status?: GenerationStatus
  moderation?: ContentModerationStatus
  featuredOnly?: boolean
  limit?: number
  offset?: number
}

/**
 * The moderation queue.
 *
 * Every filter is available, because the two tasks here are opposites: sweeping
 * the newest published work, and finding one specific shot somebody reported —
 * which may already have been hidden.
 *
 * Assets come from a second query keyed by generation id rather than a PostgREST
 * embed. The schema map declares `Relationships: []` (see types/database.ts), so an
 * `assets(*)` embed is untyped and resolves to an error shape; the rest of the app
 * groups assets the same way, via `assetsByGeneration`. Two queries for a page of
 * forty, not forty-one.
 */
export async function listShots(query: ShotQuery = {}): Promise<{ shots: ShotRow[]; total: number }> {
  const { search, visibility, status, moderation, featuredOnly, limit = 36, offset = 0 } = query

  const admin = createAdminClient()

  let builder = admin.from('generations').select('*', { count: 'exact' }).is('deleted_at', null)

  if (visibility) builder = builder.eq('visibility', visibility)
  if (status) builder = builder.eq('status', status)
  if (moderation) builder = builder.eq('moderation_status', moderation)
  if (featuredOnly) builder = builder.eq('is_featured', true)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`prompt.ilike.${pattern},title.ilike.${pattern},author_handle.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[moderation.service] listShots failed:', error.message)
    return { shots: [], total: 0 }
  }

  const rows = data ?? []
  const assets = await assetsFor(rows.map((row) => row.id))

  return {
    shots: rows.map((row) => ({ ...row, assets: assets.get(row.id) ?? [] })),
    total: count ?? 0,
  }
}

/**
 * Assets grouped by generation, through the service role.
 *
 * `assetsByGeneration` in asset.service.ts does the same grouping but reads through
 * the *user's* client, which is correct for an owner's gallery and returns nothing
 * here — RLS on `assets` is own-row, and an operator is not the owner.
 */
async function assetsFor(generationIds: string[]): Promise<Map<string, AssetRow[]>> {
  const grouped = new Map<string, AssetRow[]>()
  if (generationIds.length === 0) return grouped

  const { data, error } = await createAdminClient()
    .from('assets')
    .select('*')
    .in('generation_id', generationIds)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[moderation.service] assetsFor failed:', error.message)
    return grouped
  }

  for (const asset of data ?? []) {
    const bucket = grouped.get(asset.generation_id)
    if (bucket) bucket.push(asset)
    else grouped.set(asset.generation_id, [asset])
  }

  return grouped
}

export async function getShot(id: string): Promise<ShotRow | null> {
  const { data, error } = await createAdminClient()
    .from('generations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[moderation.service] getShot failed:', error.message)
    return null
  }
  if (!data) return null

  const assets = await assetsFor([data.id])
  return { ...data, assets: assets.get(data.id) ?? [] }
}

/**
 * Hides a published shot.
 *
 * Both writes together: `visibility` is the enforcement and `moderation_status` is
 * the record. See the header for why it is not a new filter.
 */
export async function hideShot(
  id: string,
  note: string | null,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const before = await getShot(id)
  if (!before) return { ok: false, error: 'That shot no longer exists.' }

  const { error } = await createAdminClient()
    .from('generations')
    .update({
      visibility: 'private',
      moderation_status: 'hidden',
      moderation_note: note?.trim() || null,
      moderated_at: new Date().toISOString(),
      moderated_by: actor.id,
      // A hidden shot should not also be promoted on the landing page.
      is_featured: false,
    })
    .eq('id', id)

  if (error) {
    console.error('[moderation.service] hide failed:', error.message)
    return { ok: false, error: 'Could not hide that shot.' }
  }

  await audit({
    actor,
    action: 'hide',
    entity: 'generation',
    entityId: id,
    summary: `Hid a shot by ${before.author_handle ?? 'unknown'}${note ? ` — ${note}` : ''}`,
    before: { visibility: before.visibility, moderation_status: before.moderation_status },
    after: { visibility: 'private', moderation_status: 'hidden' },
  })

  return { ok: true, data: null }
}

/**
 * Restores a hidden shot to the feed.
 *
 * The `generations_public_requires_success` check means only a succeeded job can be
 * public, so a failed one is refused here with a sentence rather than by the
 * constraint — which would surface as an opaque database error.
 */
export async function approveShot(id: string, actor: AdminActor): Promise<AdminResult<null>> {
  const before = await getShot(id)
  if (!before) return { ok: false, error: 'That shot no longer exists.' }
  if (before.status !== 'succeeded') {
    return { ok: false, error: 'Only a shot that finished rendering can be published.' }
  }

  const { error } = await createAdminClient()
    .from('generations')
    .update({
      visibility: 'public',
      moderation_status: 'approved',
      moderation_note: null,
      moderated_at: new Date().toISOString(),
      moderated_by: actor.id,
    })
    .eq('id', id)

  if (error) {
    console.error('[moderation.service] approve failed:', error.message)
    return { ok: false, error: 'Could not publish that shot.' }
  }

  await audit({
    actor,
    action: 'approve',
    entity: 'generation',
    entityId: id,
    summary: `Restored a shot by ${before.author_handle ?? 'unknown'} to the feed`,
    before: { visibility: before.visibility, moderation_status: before.moderation_status },
    after: { visibility: 'public', moderation_status: 'approved' },
  })

  return { ok: true, data: null }
}

/**
 * Promotes or demotes a shot for the landing showcase.
 *
 * Only a published, succeeded shot can be featured — the same rule as approval,
 * for the same reason: the showcase renders from the public feed, so featuring
 * something private would produce a card nobody can open.
 */
export async function setShotFeatured(
  id: string,
  featured: boolean,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const before = await getShot(id)
  if (!before) return { ok: false, error: 'That shot no longer exists.' }

  if (featured && (before.visibility !== 'public' || before.status !== 'succeeded')) {
    return { ok: false, error: 'Publish the shot before featuring it.' }
  }

  const { error } = await createAdminClient()
    .from('generations')
    .update({ is_featured: featured })
    .eq('id', id)

  if (error) {
    console.error('[moderation.service] feature failed:', error.message)
    return { ok: false, error: 'Could not change that.' }
  }

  await audit({
    actor,
    action: featured ? 'feature' : 'unfeature',
    entity: 'generation',
    entityId: id,
    summary: `${featured ? 'Featured' : 'Unfeatured'} a shot by ${before.author_handle ?? 'unknown'}`,
    before: { is_featured: before.is_featured },
    after: { is_featured: featured },
  })

  return { ok: true, data: null }
}

/**
 * Removes a shot and its media.
 *
 * A soft delete on the row and a hard delete of the bytes, which is the same
 * shape the owner's own delete takes — `deleteGenerationMedia` is reused rather
 * than reimplemented so the two paths cannot diverge on what "deleted" means.
 *
 * Soft rather than hard on purpose: `credit_ledger.generation_id` points at this
 * row, and hard-deleting it would set those references null and lose the link
 * between a charge and what it paid for.
 */
export async function deleteShot(
  id: string,
  reason: string | null,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const before = await getShot(id)
  if (!before) return { ok: false, error: 'That shot no longer exists.' }

  const removed = await deleteGenerationMediaAsAdmin(id)

  const { error } = await createAdminClient()
    .from('generations')
    .update({
      deleted_at: new Date().toISOString(),
      visibility: 'private',
      moderation_status: 'hidden',
      moderation_note: reason?.trim() || 'Removed by a moderator',
      moderated_at: new Date().toISOString(),
      moderated_by: actor.id,
      is_featured: false,
    })
    .eq('id', id)

  if (error) {
    console.error('[moderation.service] delete failed:', error.message)
    return { ok: false, error: 'Could not remove that shot.' }
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'generation',
    entityId: id,
    summary: `Removed a shot by ${before.author_handle ?? 'unknown'} and ${removed} file(s)${reason ? ` — ${reason}` : ''}`,
    before: { prompt: before.prompt, visibility: before.visibility, model_id: before.model_id },
    after: { deleted_at: 'now' },
  })

  return { ok: true, data: null }
}

/**
 * The asset rows and their storage objects, removed by an operator.
 *
 * `deleteGenerationMedia` in asset.service.ts reads through the *user's* client,
 * which is correct for an owner deleting their own work and useless here — an
 * operator is not the owner and RLS would return nothing. So this is the admin
 * equivalent, and it deliberately mirrors that function's order: objects first,
 * rows second, and a storage failure degrades to orphaned bytes rather than a
 * refused moderation action.
 */
async function deleteGenerationMediaAsAdmin(generationId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: assets, error } = await admin
    .from('assets')
    .select('id, storage_path')
    .eq('generation_id', generationId)

  if (error) {
    console.error('[moderation.service] asset read failed:', error.message)
    return 0
  }
  if (!assets || assets.length === 0) return 0

  const paths = assets
    .map((asset) => asset.storage_path)
    .filter((path): path is string => Boolean(path))

  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from('generations').remove(paths)
    if (removeError) {
      console.error('[moderation.service] object removal failed:', removeError.message)
    }
  }

  const { error: rowError } = await admin.from('assets').delete().eq('generation_id', generationId)
  if (rowError) {
    console.error('[moderation.service] asset row removal failed:', rowError.message)
    return 0
  }

  return assets.length
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface CommentQuery {
  search?: string
  hiddenOnly?: boolean
  limit?: number
  offset?: number
}

export async function listComments(
  query: CommentQuery = {},
): Promise<{ comments: CommentRow[]; total: number }> {
  const { search, hiddenOnly, limit = 40, offset = 0 } = query

  let builder = createAdminClient().from('comments').select('*', { count: 'exact' })

  if (hiddenOnly) builder = builder.eq('is_hidden', true)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`body.ilike.${pattern},author_handle.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[moderation.service] listComments failed:', error.message)
    return { comments: [], total: 0 }
  }

  return { comments: data ?? [], total: count ?? 0 }
}

export async function setCommentHidden(
  id: string,
  hidden: boolean,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('comments')
    .select('id, body, author_handle, is_hidden')
    .eq('id', id)
    .maybeSingle()

  if (!before) return { ok: false, error: 'That comment no longer exists.' }

  const { error } = await admin
    .from('comments')
    .update({
      is_hidden: hidden,
      hidden_at: hidden ? new Date().toISOString() : null,
      hidden_by: hidden ? actor.id : null,
    })
    .eq('id', id)

  if (error) {
    console.error('[moderation.service] comment hide failed:', error.message)
    return { ok: false, error: 'Could not update that comment.' }
  }

  await audit({
    actor,
    action: hidden ? 'hide' : 'unhide',
    entity: 'comment',
    entityId: id,
    summary: `${hidden ? 'Hid' : 'Restored'} a comment by ${before.author_handle ?? 'unknown'}`,
    before: { is_hidden: before.is_hidden },
    after: { is_hidden: hidden },
  })

  return { ok: true, data: null }
}

/**
 * Deletes a comment outright.
 *
 * Hiding is the reversible option and the one the UI leads with. This exists for
 * the cases where the content itself must not remain in the database — and because
 * the row is gone afterwards, the audit entry keeps the body so there is a record
 * of what was removed.
 *
 * The generation's `comment_count` is decremented in the same breath, because the
 * trigger that maintains it fires on insert and on the app's own delete path, not
 * on an admin delete.
 */
export async function deleteComment(id: string, actor: AdminActor): Promise<AdminResult<null>> {
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('comments')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!before) return { ok: false, error: 'That comment no longer exists.' }

  const { error } = await admin.from('comments').delete().eq('id', id)

  if (error) {
    console.error('[moderation.service] comment delete failed:', error.message)
    return { ok: false, error: 'Could not delete that comment.' }
  }

  const { data: generation } = await admin
    .from('generations')
    .select('comment_count')
    .eq('id', before.generation_id)
    .maybeSingle()

  if (generation) {
    await admin
      .from('generations')
      .update({ comment_count: Math.max((generation.comment_count ?? 1) - 1, 0) })
      .eq('id', before.generation_id)
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'comment',
    entityId: id,
    summary: `Deleted a comment by ${before.author_handle ?? 'unknown'}`,
    before: { body: before.body, author_handle: before.author_handle, generation_id: before.generation_id },
  })

  return { ok: true, data: null }
}
