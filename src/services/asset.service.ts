import 'server-only'

import type { RawAsset } from '@/lib/ai/types'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { AssetKind, AssetRow, GenerationRow } from '@/types/database'

/**
 * Output media.
 *
 * Provider URLs expire — usually within the hour — so a finished job's media is
 * copied into our own `generations` bucket before the asset row is written. The
 * row therefore always points at something that will still be there tomorrow.
 *
 * The one exception is a same-origin path (`/samples/...`), which the mock
 * driver returns: that is already served by us and has nothing to copy.
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
  url: string
  storagePath: string | null
  sizeBytes: number | null
  mimeType: string | null
}

/**
 * Copies one provider asset into the generations bucket.
 * Falls back to the provider URL if the copy fails, because a generation the
 * user can see for an hour beats a generation they never see at all.
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

  try {
    const response = await fetch(asset.url)
    if (!response.ok) throw new Error(`provider returned ${response.status}`)

    const buffer = await response.arrayBuffer()
    const contentType =
      asset.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream'
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
    console.error(
      `[asset.service] could not copy ${asset.url} into storage, keeping the provider URL:`,
      cause instanceof Error ? cause.message : cause,
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

  const rows = rawAssets.map((asset, index) => ({
    generation_id: generation.id,
    user_id: generation.user_id,
    kind: asset.kind as AssetKind,
    url: stored[index]!.url,
    storage_path: stored[index]!.storagePath,
    mime_type: stored[index]!.mimeType,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration_ms: asset.durationMs ?? null,
    size_bytes: stored[index]!.sizeBytes,
    sort_order: index,
  }))

  const { data, error } = await admin.from('assets').insert(rows).select('*')

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

  const supabase = await createClient()
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
