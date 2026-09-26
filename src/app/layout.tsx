import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Toaster } from 'sonner'

import { RouteProgress } from '@/components/route-progress'
import { siteConfig } from '@/config/site'

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

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
}

export const viewport: Viewport = {
  // The graphite canvas, so a mobile browser's chrome matches the page rather
  // than framing it in a different dark.
  themeColor: '#1f2227',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
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
