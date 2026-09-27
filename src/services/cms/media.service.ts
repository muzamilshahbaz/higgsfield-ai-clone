import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { env } from '@/lib/env'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { cmsAdminClient, cmsReadClient } from '@/lib/supabase/cms'
import type { MediaLibraryRow } from '@/types/cms'
import type { MediaCategory } from '@/types/database'

/**
 * The media library.
 *
 * Uploads land in the public `generations` bucket under a `cms/` prefix. That
 * bucket is the right home and it needed no policy change: migration 0004 already
 * made it world-readable with no insert policy for end users, so an operator's
 * logo is servable from a CDN URL and only the service role can put one there.
 * The `uploads` bucket would have been wrong — it is private and partitioned per
 * user, which is what a reference image for one person's job wants and not what a
 * site-wide asset wants.
 *
 * Two invariants:
 *
 *   · A row owns at most one storage object, enforced by the unique index on
 *     `storage_path` in migration 0016. That is what makes deleting a row safe to
 *     delete the object with — without it, a duplicated path would mean removing
 *     one row could blank another row's image.
 *
 *   · Deleting the object is best effort; deleting the row is not. An operator who
 *     removes an image wants it out of the library, and a storage error should
 *     leave orphaned bytes rather than an entry they cannot get rid of. The
 *     opposite order would leave a row pointing at a 404.
 */

export const MEDIA_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/x-icon',
] as const

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
}

/** 10MB, matching the composer's own ceiling so the two limits agree. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024

export const MEDIA_FOLDERS = ['library', 'brand', 'landing', 'models', 'presets', 'social'] as const

export interface MediaItem {
  id: string
  slug: string
  title: string | null
  category: MediaCategory
  folder: string
  url: string
  alt: string
  width: number | null
  height: number | null
  mimeType: string | null
  sizeBytes: number | null
  creditName: string | null
  creditUrl: string | null
  tags: string[]
  source: 'external' | 'upload'
  storagePath: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function toItem(row: MediaLibraryRow): MediaItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    folder: row.folder,
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    creditName: row.credit_name,
    creditUrl: row.credit_url,
    tags: row.tags,
    source: row.source,
    storagePath: row.storage_path,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface MediaQuery {
  search?: string
  category?: MediaCategory
  folder?: string
  /** Admin only; a public caller cannot see inactive rows either way. */
  includeInactive?: boolean
  limit?: number
  offset?: number
}

/**
 * The library, filtered. Admin only.
 *
 * Search covers the slug, the title and the alt text — the three things an
 * operator would remember an image by. `ilike` with a wrapped pattern rather than
 * full-text search: the table is small, the index on `folder` already carries the
 * common filter, and a tsvector column would be a migration for a list nobody
 * paginates past the second page of.
 */
export async function listMedia(query: MediaQuery = {}): Promise<{ items: MediaItem[]; total: number }> {
  const { search, category, folder, includeInactive = true, limit = 60, offset = 0 } = query

  let builder = cmsAdminClient().from('media_assets').select('*', { count: 'exact' })

  if (!includeInactive) builder = builder.eq('is_active', true)
  if (category) builder = builder.eq('category', category)
  if (folder) builder = builder.eq('folder', folder)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`slug.ilike.${pattern},title.ilike.${pattern},alt.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[media.service] list failed:', error.message)
    return { items: [], total: 0 }
  }

  return { items: (data ?? []).map(toItem), total: count ?? 0 }
}

export async function getMediaItem(id: string): Promise<MediaItem | null> {
  const { data, error } = await cmsAdminClient()
    .from('media_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[media.service] get failed:', error.message)
    return null
  }
  return data ? toItem(data) : null
}

/**
 * Active media by id, for a CMS row that references one.
 *
 * Read through the RLS-bound client because the callers are public surfaces — a
 * landing section's background, a testimonial's avatar — and `media_assets` is
 * world-readable for active rows by policy. One query for a page's worth of ids
 * rather than one per reference.
 */
export async function resolveMediaUrls(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const resolved = new Map<string, string>()
  if (wanted.length === 0) return resolved

  const supabase = await cmsReadClient()
  if (!supabase) return resolved

  const { data, error } = await supabase
    .from('media_assets')
    .select('id, url')
    .in('id', wanted)
    .eq('is_active', true)

  if (error) {
    console.error('[media.service] resolve failed:', error.message)
    return resolved
  }

  for (const row of data ?? []) resolved.set(row.id, row.url)
  return resolved
}

/** Distinct folders in use, plus the standard ones, for the filter bar. */
export async function listMediaFolders(): Promise<string[]> {
  const { data, error } = await cmsAdminClient().from('media_assets').select('folder')
  if (error) {
    console.error('[media.service] folder read failed:', error.message)
    return [...MEDIA_FOLDERS]
  }
  const used = new Set<string>([...MEDIA_FOLDERS, ...(data ?? []).map((row) => row.folder)])
  return [...used].sort()
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * The public URL for an object in the media bucket.
 *
 * Built rather than read back from `getPublicUrl`, so this stays synchronous and
 * so the shape is the documented one. If `supabaseUrl` is somehow absent the
 * upload could not have happened, but the fallback keeps the return type honest
 * rather than emitting `undefined/storage/...`.
 */
function publicUrl(path: string): string {
  const base = (env.supabaseUrl ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${STORAGE_BUCKETS.generations}/${path}`
}

/** A slug that is unique enough not to collide and readable enough to search. */
function slugify(input: string, fallback: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || fallback
}

export interface UploadInput {
  file: File
  title?: string | null
  alt: string
  category: MediaCategory
  folder: string
  creditName?: string | null
  creditUrl?: string | null
  tags?: string[]
}

/**
 * Uploads a file and records it.
 *
 * Validated here as well as on the bucket. The bucket's mime and size limits are
 * the real enforcement — a request that gets past this still has to satisfy them —
 * but a sentence an operator can act on beats a raw storage error, which is the
 * same reasoning the composer's upload route already follows.
 *
 * The object goes up first and the row second. If the insert fails the object is
 * removed again, because the alternative is bytes in a bucket that nothing
 * references and nothing can find.
 */
export async function uploadMedia(
  input: UploadInput,
  actor: AdminActor,
): Promise<AdminResult<MediaItem>> {
  const { file } = input

  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Use a PNG, JPEG, WebP, AVIF, SVG or ICO file.', field: 'file' }
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      error: `Images must be ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)}MB or smaller.`,
      field: 'file',
    }
  }
  if (!input.alt.trim()) {
    return { ok: false, error: 'Alt text is required — describe what is in the frame.', field: 'alt' }
  }

  const client = cmsAdminClient()
  const extension = EXTENSION_BY_MIME[file.type] ?? 'png'
  const baseName = slugify(input.title || file.name.replace(/\.[^.]+$/, ''), 'asset')
  // The uuid in the path is what makes two uploads of `logo.png` two objects
  // rather than one overwriting the other, and it is why `upsert` stays false.
  const path = `cms/${input.folder}/${baseName}-${crypto.randomUUID().slice(0, 8)}.${extension}`

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKETS.generations)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[media.service] upload failed:', uploadError.message)
    return { ok: false, error: 'Could not upload that file. Try again.' }
  }

  const url = publicUrl(path)

  const { data, error } = await client
    .from('media_assets')
    .insert({
      slug: `${baseName}-${crypto.randomUUID().slice(0, 6)}`,
      title: input.title?.trim() || null,
      category: input.category,
      folder: input.folder,
      url,
      alt: input.alt.trim(),
      credit_name: input.creditName?.trim() || null,
      credit_url: input.creditUrl?.trim() || null,
      tags: input.tags ?? [],
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: path,
      source: 'upload',
      uploaded_by: actor.id,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[media.service] row insert failed, removing the object:', error?.message)
    await client.storage.from(STORAGE_BUCKETS.generations).remove([path])
    return { ok: false, error: 'Uploaded, but the library entry could not be saved.' }
  }

  await audit({
    actor,
    action: 'create',
    entity: 'media',
    entityId: data.id,
    summary: `Uploaded ${data.slug} to ${data.folder}`,
    after: { slug: data.slug, folder: data.folder, url: data.url, size_bytes: data.size_bytes },
  })

  return { ok: true, data: toItem(data) }
}

/**
 * Registers an image somebody else hosts.
 *
 * The original purpose of this table (migration 0011) and still useful: reference
 * photography is hosted by whoever took it, and storing a URL rather than bytes
 * keeps that a catalogue. `media_assets_url_absolute` requires https, which is
 * checked here too so the operator gets a sentence rather than a constraint name.
 */
export async function linkMedia(
  input: {
    url: string
    slug?: string
    title?: string | null
    alt: string
    category: MediaCategory
    folder: string
    creditName?: string | null
    creditUrl?: string | null
    tags?: string[]
  },
  actor: AdminActor,
): Promise<AdminResult<MediaItem>> {
  const url = input.url.trim()
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, error: 'The URL has to start with https://.', field: 'url' }
  }
  if (!input.alt.trim()) {
    return { ok: false, error: 'Alt text is required — describe what is in the frame.', field: 'alt' }
  }

  const slug = slugify(input.slug || input.title || 'reference', 'reference')

  const { data, error } = await cmsAdminClient()
    .from('media_assets')
    .insert({
      slug: `${slug}-${crypto.randomUUID().slice(0, 6)}`,
      title: input.title?.trim() || null,
      category: input.category,
      folder: input.folder,
      url,
      alt: input.alt.trim(),
      credit_name: input.creditName?.trim() || null,
      credit_url: input.creditUrl?.trim() || null,
      tags: input.tags ?? [],
      source: 'external',
      uploaded_by: actor.id,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[media.service] link failed:', error?.message)
    return { ok: false, error: 'Could not add that image.' }
  }

  await audit({
    actor,
    action: 'create',
    entity: 'media',
    entityId: data.id,
    summary: `Linked ${data.slug} (${data.folder})`,
    after: { slug: data.slug, url: data.url, source: 'external' },
  })

  return { ok: true, data: toItem(data) }
}

export interface MediaUpdate {
  title?: string | null
  alt?: string
  category?: MediaCategory
  folder?: string
  creditName?: string | null
  creditUrl?: string | null
  tags?: string[]
  isActive?: boolean
  sortOrder?: number
}

export async function updateMedia(
  id: string,
  update: MediaUpdate,
  actor: AdminActor,
): Promise<AdminResult<MediaItem>> {
  const before = await getMediaItem(id)
  if (!before) return { ok: false, error: 'That image is no longer in the library.' }

  const { data, error } = await cmsAdminClient()
    .from('media_assets')
    .update({
      ...(update.title !== undefined ? { title: update.title?.trim() || null } : {}),
      ...(update.alt !== undefined ? { alt: update.alt.trim() } : {}),
      ...(update.category !== undefined ? { category: update.category } : {}),
      ...(update.folder !== undefined ? { folder: update.folder } : {}),
      ...(update.creditName !== undefined ? { credit_name: update.creditName?.trim() || null } : {}),
      ...(update.creditUrl !== undefined ? { credit_url: update.creditUrl?.trim() || null } : {}),
      ...(update.tags !== undefined ? { tags: update.tags } : {}),
      ...(update.isActive !== undefined ? { is_active: update.isActive } : {}),
      ...(update.sortOrder !== undefined ? { sort_order: update.sortOrder } : {}),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[media.service] update failed:', error?.message)
    return { ok: false, error: 'Could not save that image.' }
  }

  await audit({
    actor,
    action: 'update',
    entity: 'media',
    entityId: id,
    summary: `Edited ${data.slug}`,
    before: before as unknown as Record<string, unknown>,
    after: data as unknown as Record<string, unknown>,
  })

  return { ok: true, data: toItem(data) }
}

/**
 * Replaces the file behind an existing entry, keeping its id.
 *
 * The id is what every CMS row references, so replacing a logo must not mean
 * re-pointing every reference at a new row. The new object is uploaded first, the
 * row is re-pointed, and only then is the old object removed — in that order,
 * because a failure anywhere before the last step leaves the entry working.
 */
export async function replaceMedia(
  id: string,
  file: File,
  actor: AdminActor,
): Promise<AdminResult<MediaItem>> {
  const before = await getMediaItem(id)
  if (!before) return { ok: false, error: 'That image is no longer in the library.' }

  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Use a PNG, JPEG, WebP, AVIF, SVG or ICO file.', field: 'file' }
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      error: `Images must be ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)}MB or smaller.`,
      field: 'file',
    }
  }

  const client = cmsAdminClient()
  const extension = EXTENSION_BY_MIME[file.type] ?? 'png'
  const path = `cms/${before.folder}/${before.slug}-${crypto.randomUUID().slice(0, 8)}.${extension}`

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKETS.generations)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[media.service] replace upload failed:', uploadError.message)
    return { ok: false, error: 'Could not upload the replacement. The old image is unchanged.' }
  }

  const { data, error } = await client
    .from('media_assets')
    .update({
      url: publicUrl(path),
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      source: 'upload',
      // Dimensions were for the old file and would now be a lie. Null is honest;
      // the browser measures the real ones.
      width: null,
      height: null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[media.service] replace row update failed:', error?.message)
    await client.storage.from(STORAGE_BUCKETS.generations).remove([path])
    return { ok: false, error: 'Could not point the entry at the new file.' }
  }

  // Last, and best effort. A leftover object costs storage; a premature delete
  // costs a broken image on the live site.
  if (before.storagePath) {
    const { error: removeError } = await client.storage
      .from(STORAGE_BUCKETS.generations)
      .remove([before.storagePath])
    if (removeError) {
      console.error('[media.service] old object not removed:', removeError.message)
    }
  }

  await audit({
    actor,
    action: 'replace',
    entity: 'media',
    entityId: id,
    summary: `Replaced the file behind ${data.slug}`,
    before: { url: before.url, size_bytes: before.sizeBytes },
    after: { url: data.url, size_bytes: data.size_bytes },
  })

  return { ok: true, data: toItem(data) }
}

/**
 * Deletes an entry, and its object if it owns one.
 *
 * Row first, object second — see the header. The `on delete set null` on every
 * `media_id` foreign key means a CMS row that referenced this image keeps working
 * and falls back to whatever it renders without one, rather than the delete being
 * refused or cascading into content.
 */
export async function deleteMedia(id: string, actor: AdminActor): Promise<AdminResult<null>> {
  const before = await getMediaItem(id)
  if (!before) return { ok: false, error: 'That image is no longer in the library.' }

  const client = cmsAdminClient()

  const { error } = await client.from('media_assets').delete().eq('id', id)
  if (error) {
    console.error('[media.service] delete failed:', error.message)
    return { ok: false, error: 'Could not remove that image.' }
  }

  if (before.storagePath) {
    const { error: removeError } = await client.storage
      .from(STORAGE_BUCKETS.generations)
      .remove([before.storagePath])
    if (removeError) {
      console.error('[media.service] object not removed:', removeError.message)
    }
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'media',
    entityId: id,
    summary: `Deleted ${before.slug} from ${before.folder}`,
    before: { slug: before.slug, url: before.url, folder: before.folder },
  })

  return { ok: true, data: null }
}
