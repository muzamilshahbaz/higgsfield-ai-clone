import 'server-only'

import { tryCreateClient } from '@/lib/supabase/server'
import type { MediaAssetRow, MediaCategory } from '@/types/database'

/**
 * Reference imagery, read from the database.
 *
 * This replaced two generations of the same mistake: first six animated SVG
 * gradients bundled under public/samples, then a curated array of CDN ids in a
 * .tsx file. Both were content that needed a code change and a deploy to edit.
 *
 * Nothing in here is generated output. Every surface that renders it says so —
 * see `CreatorShowcase` and the presets header — because a stock photograph
 * captioned as somebody's work, or as a model's result, is a lie that looks
 * more convincing than the gradients ever did.
 *
 * Read through the anon client on purpose: `media_assets` is world-readable by
 * policy (migration 0011) and the landing page is the first thing an
 * unauthenticated visitor loads. Nothing here needs the service role.
 */

export interface MediaAsset {
  slug: string
  category: MediaCategory
  url: string
  alt: string
  width: number | null
  height: number | null
  creditName: string | null
  creditUrl: string | null
  tags: string[]
}

export type { MediaCategory }

/**
 * The one loose seam in this file, and the reason it is here.
 *
 * `media_assets` is not registered in the `Database` map — registering an
 * eleventh table breaks supabase-js's type resolution for every other table
 * (see the note on MediaAssetRow in types/database.ts). So this table is
 * queried through a narrowed client and the rows are mapped back onto the
 * real interface immediately, which keeps the untyped surface to two lines
 * rather than spreading it through the schema.
 */
type LooseClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
          in: (column: string, values: readonly unknown[]) => never
          limit: (count: number) => never
        }
      }
    }
  }
}

type MediaRow = Pick<
  MediaAssetRow,
  'slug' | 'category' | 'url' | 'alt' | 'width' | 'height' | 'credit_name' | 'credit_url' | 'tags'
>

function toAsset(row: MediaRow): MediaAsset {
  return {
    slug: row.slug,
    category: row.category,
    url: row.url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    creditName: row.credit_name,
    creditUrl: row.credit_url,
    tags: row.tags ?? [],
  }
}

export interface ListMediaOptions {
  categories?: MediaCategory[]
  limit?: number
}

/**
 * Active media, in catalogue order.
 *
 * Returns an empty array for every failure — an unreachable database, a table
 * that does not exist yet because migration 0011 has not been applied. A
 * landing page that 500s because a decorative photograph could not be found
 * would be a worse outcome than one that renders without it, so every caller
 * is expected to cope with nothing.
 */
export async function listMedia(options: ListMediaOptions = {}): Promise<MediaAsset[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as unknown as LooseClient)
    .from('media_assets')
    .select('slug, category, url, alt, width, height, credit_name, credit_url, tags')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (options.categories?.length) query = query.in('category', options.categories)
  if (options.limit) query = query.limit(options.limit)

  const { data, error } = (await query) as {
    data: MediaRow[] | null
    error: { message: string } | null
  }

  if (error) {
    console.error('[media.service] listMedia failed:', error.message)
    return []
  }

  return (data ?? []).map(toAsset)
}

/**
 * A spread across categories, for a surface that wants variety.
 *
 * Interleaves rather than concatenates: asking for twelve and getting nine
 * landscapes followed by three portraits looks like a bug in the grid, where
 * one of each in turn reads as a curated wall.
 */
export async function listMediaMix(limit: number): Promise<MediaAsset[]> {
  const all = await listMedia()
  if (all.length === 0) return []

  const byCategory = new Map<MediaCategory, MediaAsset[]>()
  for (const asset of all) {
    const bucket = byCategory.get(asset.category)
    if (bucket) bucket.push(asset)
    else byCategory.set(asset.category, [asset])
  }

  const buckets = [...byCategory.values()]
  const mixed: MediaAsset[] = []

  for (let round = 0; mixed.length < limit; round += 1) {
    let added = false
    for (const bucket of buckets) {
      const asset = bucket[round]
      if (!asset) continue
      mixed.push(asset)
      added = true
      if (mixed.length === limit) break
    }
    // Every bucket is exhausted: return what there is rather than loop forever.
    if (!added) break
  }

  return mixed
}
