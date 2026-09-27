import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Toaster } from 'sonner'

import { RouteProgress } from '@/components/route-progress'
import { ThemeStyle } from '@/components/brand/theme-style'
import { siteConfig } from '@/config/site'
import { getSettings } from '@/services/cms/settings.service'

import './globals.css'

/**
 * Two typefaces, two jobs.
 *
 * Inter runs the interface: it is the one sans with a genuinely quiet `1` and
 * tabular figures, and this product puts numbers in front of people constantly
 * — credits, durations, seeds, prices.
 *
 * Space Grotesk runs the headings. Its flat terminals and tight apertures give
 * a display line some mechanical character without the novelty that makes a
 * geometric face unreadable at 14px, and globals.css binds it to h1–h4 so no
 * component has to remember it.
 *
 * Both are subset to latin and `display: swap`: the first paint of the landing
 * page should not wait on a font file.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

/**
 * Metadata, read from the database.
 *
 * `generateMetadata` rather than a static export, because the site name, the title template
 * and the Open Graph card are all editable in the admin panel — and a static object would be
 * frozen at build time.
 *
 * Every field falls back to the value the app shipped with: `getSettings` resolves to
 * `DEFAULT_SETTINGS` on an unconfigured or unreachable database, so a deploy with no Supabase
 * credentials still serves complete metadata rather than empty strings. That is not
 * hypothetical — a deploy with those variables unset once served 500s across the app, and the
 * whole CMS read layer is built around not repeating it.
 *
 * `metadataBase` stays the environment's site URL. It is infrastructure, not content: an
 * operator who could edit it from a form could break every absolute URL the app emits.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()

  const title = settings.seo.defaultTitle || `${settings.site.name} — ${settings.site.tagline}`
  const description = settings.site.description

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: title,
      // The template has to contain %s or every page inherits one title. The admin action
      // refuses to save one without it; this is the second guard, for a row written any other
      // way.
      template: settings.seo.titleTemplate.includes('%s')
        ? settings.seo.titleTemplate
        : `%s · ${settings.site.name}`,
    },
    description,
    keywords: settings.seo.keywords.length > 0 ? settings.seo.keywords : undefined,
    // A custom favicon replaces the generated icon route. Declared here rather than as a file
    // convention, because the URL is configuration.
    icons: settings.branding.faviconUrl ? { icon: settings.branding.faviconUrl } : undefined,
    openGraph: {
      type: 'website',
      siteName: settings.site.name,
      title,
      description,
      images: settings.seo.ogImageUrl ? [settings.seo.ogImageUrl] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: settings.seo.twitterHandle ? `@${settings.seo.twitterHandle}` : undefined,
      images: settings.seo.ogImageUrl ? [settings.seo.ogImageUrl] : undefined,
    },
    // Mirrors the `seo.robots_index` setting. robots.txt carries the same decision; this is
    // the per-page meta tag, which is what a crawler that ignores robots.txt reads.
    robots: settings.seo.robotsIndex ? undefined : { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  /*
   * The graphite canvas, so a mobile browser's chrome matches the page rather than framing it
   * in a different dark.
   *
   * Deliberately still a literal while the background token is editable. `themeColor` has to
   * be a colour a browser's own chrome can parse, `oklch()` support there is inconsistent, and
   * a value it cannot read leaves the address bar an unrelated colour. The mismatch after a
   * theme edit is a shade of dark grey; a broken address bar would be worse.
   */
  themeColor: '#1f2227',
  colorScheme: 'dark',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // One read, shared with `generateMetadata` above through the per-request cache.
  const settings = await getSettings()

  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      {/*
        `suppressHydrationWarning` here is about browser extensions, not about
        anything this app renders. Grammarly and friends write their own
        attributes — `data-gr-ext-installed`, `data-new-gr-c-s-check-loaded` —
        onto <body> before React hydrates, so the server HTML and the live DOM
        genuinely differ and React reports a mismatch the app cannot fix.

        It is safe because the flag is one level deep: it silences mismatches on
        this element's own attributes and text only, never its children. A real
        hydration bug inside the tree still shouts. That is also why it belongs
        on <body> specifically rather than being sprinkled downward — the same
        reason <html> above already carries it.
      */}
      <body
        className="min-h-dvh bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        {/* The operator's theme tokens, as a later :root rule. In the server-rendered HTML,
            so the first paint already has the right colours rather than flashing. */}
        <ThemeStyle settings={settings} />

        <RouteProgress />
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          richColors
          toastOptions={{
            // Sonner renders outside the Tailwind cascade, so the graphite
            // surface and border are repeated here as literals. These are the
            // resolved values of --color-surface and --color-border.
            style: {
              background: 'oklch(0.215 0.008 250)',
              border: '1px solid oklch(0.305 0.01 250)',
              color: 'oklch(0.97 0.003 250)',
              borderRadius: '0.625rem',
            },
          }}
        />
      </body>
    </html>
  )
}
