import 'server-only'

import { createHash } from 'node:crypto'

import type { RawAsset } from '@/lib/ai/types'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { env, isServiceRoleConfigured } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser, tryCreateClient } from '@/lib/supabase/server'
import type { AssetKind, AssetRow, GenerationRow } from '@/types/database'

/**
 * Output media.
 *
 * Provider URLs expire — usually within the hour — so a finished job's media is
 * copied into our own `generations` bucket before the asset row is written. The
 * row therefore always points at something that will still be there tomorrow.
 *
 * Three shapes arrive here, and the difference matters:
 *
 *   https://...     a provider URL. Copied; if the copy fails we keep the
 *                   provider URL, because media that works for an hour beats
 *                   media the user never sees.
 *   data:...        bytes a provider returned inline, which is how Hugging Face
 *                   answers. Copied; a failure is fatal for that asset, because
 *                   the alternative is writing a megabyte of base64 into a text
 *                   column and calling it a URL.
 *   /samples/...    same-origin, from the mock driver. Already served by us and
 *                   has nothing to copy.
 */

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

function isSameOrigin(url: string): boolean {
  return url.startsWith('/')
}

function extensionFor(asset: RawAsset): string {
  if (asset.mimeType && EXTENSION_BY_MIME[asset.mimeType]) return EXTENSION_BY_MIME[asset.mimeType]!
  const fromUrl = asset.url.split('?')[0]?.split('.').pop()?.toLowerCase()
  if (fromUrl && fromUrl.length <= 4 && /^[a-z0-9]+$/.test(fromUrl)) return fromUrl
  return asset.kind === 'video' ? 'mp4' : 'png'
}

interface StoredMedia {
  /** Null when the bytes could not be stored and there is no usable fallback. */
  url: string | null
  storagePath: string | null
  sizeBytes: number | null
  mimeType: string | null
}

function isDataUrl(url: string): boolean {
  return url.startsWith('data:')
}

/**
 * Bytes and content type from a `data:` URL.
 *
 * Only base64 payloads: every provider that answers inline sends base64, and a
 * percent-encoded variant would be a new shape worth failing loudly on rather
 * than half-decoding.
 */
function decodeDataUrl(url: string): { bytes: Buffer; contentType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
  if (!match?.[2] || match[3] === undefined) return null

  try {
    return {
      bytes: Buffer.from(match[3], 'base64'),
      contentType: match[1] ?? 'application/octet-stream',
    }
  } catch {
    return null
  }
}

/**
 * Copies one provider asset into the generations bucket.
 *
 * A failed copy of a provider URL keeps that URL — the user sees their
 * generation, for an hour, which beats never seeing it. A failed copy of inline
 * bytes has no such fallback and returns a null url; the caller drops the asset
 * and the generation service fails the job and refunds it.
 */
async function copyIntoStorage(
  asset: RawAsset,
  generation: Pick<GenerationRow, 'id' | 'user_id'>,
  index: number,
): Promise<StoredMedia> {
  if (isSameOrigin(asset.url)) {
    return {
      url: asset.url,
      storagePath: null,
      sizeBytes: asset.sizeBytes ?? null,
      mimeType: asset.mimeType ?? null,
    }
  }

  const inline = isDataUrl(asset.url)

  try {
    let buffer: ArrayBuffer | Buffer
    let contentType: string

    if (inline) {
      const decoded = decodeDataUrl(asset.url)
      if (!decoded || decoded.bytes.byteLength === 0) {
        throw new Error('the provider returned bytes this app could not decode')
      }
      buffer = decoded.bytes
      contentType = asset.mimeType ?? decoded.contentType
    } else {
      const response = await fetch(asset.url)
      if (!response.ok) throw new Error(`provider returned ${response.status}`)

      buffer = await response.arrayBuffer()
      contentType =
        asset.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream'
    }

    const path = `${generation.user_id}/${generation.id}/${index}-${asset.kind}.${extensionFor(asset)}`

    const admin = createAdminClient()
    const { error } = await admin.storage
      .from(STORAGE_BUCKETS.generations)
      .upload(path, buffer, { contentType, upsert: true })

    if (error) throw new Error(error.message)

    const { data } = admin.storage.from(STORAGE_BUCKETS.generations).getPublicUrl(path)

    return {
      url: data.publicUrl,
      storagePath: path,
      sizeBytes: buffer.byteLength,
      mimeType: contentType,
    }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)

    if (inline) {
      // Never fall back here. `asset.url` is the image itself, base64-encoded:
      // storing it would put megabytes in a column the client renders into an
      // `src`, and every list query would carry them.
      console.error('[asset.service] could not store inline provider bytes:', reason)
      return { url: null, storagePath: null, sizeBytes: null, mimeType: null }
    }

    console.error(
      `[asset.service] could not copy ${asset.url} into storage, keeping the provider URL:`,
      reason,
    )
    return {
      url: asset.url,
      storagePath: null,
      sizeBytes: asset.sizeBytes ?? null,
      mimeType: asset.mimeType ?? null,
    }
  }
}

/**
 * A stable asset id for (generation, slot).
 *
 * The read-then-insert below is not atomic, so two syncs that finish a job at
 * the same instant — two open tabs, or a tab and the cron sweep — can both see
 * no rows and both insert, leaving the library with duplicate media. Deriving
 * the primary key from the generation and the slot makes the second insert a
 * primary-key conflict instead, which is a guarantee rather than a narrow
 * window. UUIDv5 over the generation's own uuid namespace, per RFC 4122.
 */
function deterministicAssetId(generationId: string, index: number): string {
  const namespace = Buffer.from(generationId.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1')
    .update(namespace)
    .update(`asset:${index}`)
    .digest()

  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant

  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * Persists a completed job's media.
 *
 * Idempotent: the ticker, the opportunistic sweep and the cron backstop can all
 * sync the same job at the same moment, and only the first one writes rows.
 */
export async function persistProviderAssets(
  generation: Pick<GenerationRow, 'id' | 'user_id'>,
  rawAssets: RawAsset[],
): Promise<AssetRow[]> {
  if (rawAssets.length === 0) return []

  const admin = createAdminClient()

  const { data: existing, error: existingError } = await admin
    .from('assets')
    .select('*')
    .eq('generation_id', generation.id)
    .order('sort_order', { ascending: true })

  if (existingError) {
    console.error('[asset.service] could not check existing assets:', existingError.message)
  } else if (existing && existing.length > 0) {
    return existing
  }

  const stored = await Promise.all(
    rawAssets.map((asset, index) => copyIntoStorage(asset, generation, index)),
  )

  const rows = rawAssets
    .map((asset, index) => ({ asset, index, media: stored[index]! }))
    // An asset with no url is one whose bytes could not be stored. Writing the
    // row anyway would give the gallery a broken frame to render; dropping it
    // lets the generation service see "nothing persisted" and refund.
    .filter((entry) => entry.media.url !== null)
    .map(({ asset, index, media }) => ({
      id: deterministicAssetId(generation.id, index),
      generation_id: generation.id,
      user_id: generation.user_id,
      kind: asset.kind as AssetKind,
      url: media.url!,
      storage_path: media.storagePath,
      mime_type: media.mimeType,
      width: asset.width ?? null,
      height: asset.height ?? null,
      duration_ms: asset.durationMs ?? null,
      size_bytes: media.sizeBytes,
      sort_order: index,
    }))

  if (rows.length === 0) return []

  // upsert, not insert: the loser of the race re-reads the winner's rows
  // rather than erroring or duplicating them.
  const { data, error } = await admin
    .from('assets')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
    .select('*')

  if (error) {
    console.error('[asset.service] insert failed:', error.message)
    return []
  }
  return data ?? []
}

/** Assets for a set of generations, grouped by generation id. Read through RLS. */
export async function assetsByGeneration(generationIds: string[]): Promise<Map<string, AssetRow[]>> {
  const grouped = new Map<string, AssetRow[]>()
  if (generationIds.length === 0) return grouped

  const supabase = await tryCreateClient()
  if (!supabase) return grouped

  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .in('generation_id', generationIds)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[asset.service] assetsByGeneration failed:', error.message)
    return grouped
  }

  for (const asset of data ?? []) {
    const bucket = grouped.get(asset.generation_id)
    if (bucket) bucket.push(asset)
    else grouped.set(asset.generation_id, [asset])
  }
  return grouped
}

export interface UploadedImage {
  url: string
  path: string
}

/**
 * The signed URL for a start frame outlives any plausible job, because a
 * provider may fetch it minutes later and the composer keeps showing it.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7

/**
 * Stores a start frame in the private `uploads` bucket.
 *
 * Uploaded through the user's own client on purpose: the storage policy checks
 * that the first path segment is their uid, so a bug here cannot write into
 * someone else's folder.
 */
export async function uploadStartFrame(
  file: File,
): Promise<{ ok: true; image: UploadedImage } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const supabase = await createClient()
  const extension = EXTENSION_BY_MIME[file.type] ?? 'png'
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.uploads)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[asset.service] uploadStartFrame failed:', uploadError.message)
    return { ok: false, error: 'Could not upload that image. Try again.' }
  }

  const { data, error: signError } = await supabase.storage
    .from(STORAGE_BUCKETS.uploads)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (signError || !data?.signedUrl) {
    console.error('[asset.service] could not sign upload:', signError?.message)
    return { ok: false, error: 'Uploaded, but the image could not be read back.' }
  }

  return { ok: true, image: { url: absolute(data.signedUrl), path } }
}

/** Storage normally returns an absolute URL; this guards the relative-path case. */
function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = env.supabaseUrl ?? env.siteUrl
  return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

/**
 * Removes a generation's media: the storage objects first, then the rows.
 *
 * The `generations` bucket deliberately grants no delete policy to end users
 * (0004_storage.sql), because everything in it is written by the server after
 * a provider job finishes. So the object removal is the one part of this that
 * needs the admin client, and it is scoped to paths we just read back through
 * RLS as belonging to the caller.
 *
 * A missing service-role key degrades to orphaned bytes in the bucket rather
 * than a failed delete: the user asked for the asset to be gone from their
 * library, and that part always succeeds.
 */
export async function deleteGenerationMedia(generationId: string): Promise<number> {
  const supabase = await createClient()

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, storage_path')
    .eq('generation_id', generationId)

  if (error) {
    console.error('[asset.service] could not read assets for deletion:', error.message)
    return 0
  }
  if (!assets || assets.length === 0) return 0

  const paths = assets
    .map((asset) => asset.storage_path)
    .filter((path): path is string => Boolean(path))

  if (paths.length > 0) {
    if (isServiceRoleConfigured) {
      const admin = createAdminClient()
      const { error: removeError } = await admin.storage
        .from(STORAGE_BUCKETS.generations)
        .remove(paths)

      if (removeError) {
        console.error('[asset.service] storage cleanup failed:', removeError.message)
      }
    } else {
      console.warn(
        '[asset.service] SUPABASE_SERVICE_ROLE_KEY is not set; leaving stored media in place.',
      )
    }
  }

  const { error: deleteError } = await supabase
    .from('assets')
    .delete()
    .eq('generation_id', generationId)

  if (deleteError) {
    console.error('[asset.service] could not delete asset rows:', deleteError.message)
    return 0
  }

  return assets.length
}
