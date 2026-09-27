import type { MetadataRoute } from 'next'

import { siteConfig } from '@/config/site'
import { getSettings } from '@/services/cms/settings.service'

/**
 * What crawlers may read.
 *
 * Everything behind a session is disallowed — not as a security measure, RLS
 * and the middleware do that, but because those URLs redirect to sign-in and
 * a crawler that indexes them fills search results with a login page.
 *
 * `/admin` joins that list for the same reason and one more: a staff surface has no business
 * in an index, and the admin layout sets `robots: noindex` on top of this.
 *
 * The `seo.robots_index` setting can turn the whole thing off, which is what a staging deploy
 * wants. It falls back to allowing indexing, because the failure mode of the opposite default
 * is a production site that quietly de-indexes itself when a settings read fails.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings()

  if (!settings.seo.robotsIndex) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      // No sitemap when nothing should be indexed: advertising one is the opposite of the
      // instruction above it.
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/dashboard',
        '/create',
        '/library',
        '/history',
        '/projects',
        '/settings',
        '/auth/',
        '/sign-in',
        '/sign-up',
        '/forgot-password',
        '/reset-password',
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  }
}
