import Link from 'next/link'

import { KineticLogo } from '@/components/brand/logo'
import { marketingNav, siteConfig } from '@/config/site'

/**
 * The footer.
 *
 * Four columns on desktop, stacked on mobile, with the disclaimer on its own
 * line at the bottom rather than squeezed between two link groups. Every link
 * here goes somewhere that exists — the previous footer had two links and no
 * structure, which made the page end abruptly after a full-bleed CTA.
 *
 * The product columns are grouped by what a reader wants: the page they are on,
 * the app itself, and the honest notes about what this build is.
 */

const COLUMNS = [
  {
    heading: 'Product',
    links: marketingNav.map((item) => ({ label: item.title, href: item.href })),
  },
  {
    heading: 'Workspace',
    links: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Composer', href: '/create' },
      { label: 'Presets', href: '/presets' },
      { label: 'Explore', href: '/explore' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in', href: '/sign-in' },
      { label: 'Create an account', href: '/sign-up' },
      { label: 'API keys', href: '/settings/keys' },
      { label: 'Billing', href: '/settings/billing' },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-surface/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link href="/" className="inline-flex" aria-label="Kinetic Studio, home">
              <KineticLogo />
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {siteConfig.tagline}. Open models, one composer, and the credit cost on screen before
              you spend it.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-labelledby={`footer-${column.heading}`} className="lg:col-span-2">
              <h2
                id={`footer-${column.heading}`}
                className="eyebrow text-muted-foreground"
              >
                {column.heading}
              </h2>

              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="lg:col-span-2">
            <h2 className="eyebrow text-muted-foreground">Good to know</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>Checkout is simulated</li>
              <li>Every model open-weight</li>
              <li>Bring your own API keys</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name}. An independent portfolio project, not
            affiliated with any commercial AI video service.
          </p>
          <p className="eyebrow text-muted-foreground/70">Built on the open stack</p>
        </div>
      </div>
    </footer>
  )
}
