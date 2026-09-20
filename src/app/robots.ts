import type { MetadataRoute } from 'next'

import { siteConfig } from '@/config/site'

/**
 * What crawlers may read.
 *
 * Everything behind a session is disallowed — not as a security measure, RLS
 * and the middleware do that, but because those URLs redirect to sign-in and
 * a crawler that indexes them fills search results with a login page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
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
