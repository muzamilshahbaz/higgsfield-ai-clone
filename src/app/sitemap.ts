import type { MetadataRoute } from 'next'

import { siteConfig } from '@/config/site'
import { isSupabaseConfigured } from '@/lib/env'
import { listPublicGenerations } from '@/services/explore.service'

/**
 * The public URL set: the marketing surfaces plus every published shot.
 *
 * Capped rather than exhaustive. A sitemap is a hint, not an index, and
 * generating tens of thousands of entries on request would turn a crawler
 * visit into a load test. The newest work is also the work worth surfacing.
 *
 * Fails soft: an unreachable database yields the static routes rather than a
 * 500, because a broken sitemap is worse than a short one.
 */
const MAX_GENERATIONS = 500

// Dynamic, not revalidated. `listPublicGenerations` goes through the
// cookie-aware Supabase client to resolve the viewer's like state, and Next
// refuses to cache a route that reads cookies. The query is one indexed read
// against a capped window, so serving it per request is cheaper than the
// contortion needed to make it cacheable.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, '')
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/explore`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/presets`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]

  if (!isSupabaseConfigured) return staticRoutes

  try {
    const published = await listPublicGenerations({ limit: MAX_GENERATIONS })

    return [
      ...staticRoutes,
      ...published.map((item) => ({
        url: `${base}/g/${item.id}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ]
  } catch (cause) {
    console.error('[sitemap] could not read published work:', cause)
    return staticRoutes
  }
}
