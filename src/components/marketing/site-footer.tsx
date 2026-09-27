import Link from 'next/link'

import { SiteLogo } from '@/components/brand/site-logo'
import { DEFAULT_NAV, resolveNavHref, type NavLinkItem, type SiteNav } from '@/lib/cms/content'
import { getSiteNav } from '@/services/cms/content.service'
import { getSettings } from '@/services/cms/settings.service'

/**
 * The footer.
 *
 * Four columns on desktop, stacked on mobile, with the disclaimer on its own line at the
 * bottom rather than squeezed between two link groups.
 *
 * Every column is database-driven now, with one exception that is deliberate: the Product
 * column is built from the header's links rather than from its own rows. Those are the same
 * links pointing at the same sections, and two editable copies of one list is two copies that
 * will disagree — the header gains an entry, somebody forgets the footer, and the site has a
 * section you can reach from one place.
 *
 * The anchor rewriting is the bug this file has already had once. A bare `#pricing` points at a
 * section that only exists on the landing page, so on /explore and /g/[id] the whole Product
 * column was dead links. `resolveNavHref` is called per render with `onLandingPage`, never
 * computed once at module load, which is what fixes it.
 */

/** A footer column, resolved from the nav groups. */
interface Column {
  heading: string
  links: NavLinkItem[]
}

function columnsFor(nav: SiteNav): Column[] {
  // See the note above: Product mirrors the header rather than having its own rows, unless an
  // operator has explicitly populated `footer_product` — in which case they meant it.
  const product = nav.footer_product.length > 0 ? nav.footer_product : nav.header

  return [
    { heading: 'Product', links: product.length > 0 ? product : DEFAULT_NAV.header },
    {
      heading: 'Workspace',
      links: nav.footer_workspace.length > 0 ? nav.footer_workspace : DEFAULT_NAV.footer_workspace,
    },
    {
      heading: 'Account',
      links: nav.footer_account.length > 0 ? nav.footer_account : DEFAULT_NAV.footer_account,
    },
  ]
}

export async function SiteFooter({ onLandingPage = false }: { onLandingPage?: boolean }) {
  const [nav, settings] = await Promise.all([getSiteNav(), getSettings()])

  const columns = columnsFor(nav)
  const notes = nav.footer_note.length > 0 ? nav.footer_note : DEFAULT_NAV.footer_note
  const social = nav.social
  const legal = nav.legal

  return (
    <footer className="border-t border-border/70 bg-surface/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link href="/" className="inline-flex" aria-label={`${settings.site.name}, home`}>
              <SiteLogo />
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {settings.site.tagline}. Open models, one composer, and the credit cost on screen before
              you spend it.
            </p>

            {settings.site.supportEmail && (
              <p className="mt-4 text-sm text-muted-foreground">
                <a
                  href={`mailto:${settings.site.supportEmail}`}
                  className="transition-colors hover:text-foreground"
                >
                  {settings.site.supportEmail}
                </a>
              </p>
            )}

            {social.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                {social.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      target="_blank"
                      // `noreferrer` as well as `noopener`: an outbound link from a footer has
                      // no reason to leak the page it came from.
                      rel="noreferrer noopener"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {columns.map((column) => (
            <nav
              key={column.heading}
              aria-labelledby={`footer-${column.heading}`}
              className="lg:col-span-2"
            >
              <h2 id={`footer-${column.heading}`} className="eyebrow text-muted-foreground">
                {column.heading}
              </h2>

              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={resolveNavHref(link, onLandingPage)}
                      target={link.isExternal ? '_blank' : undefined}
                      rel={link.isExternal ? 'noreferrer noopener' : undefined}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {notes.length > 0 && (
            <div className="lg:col-span-2">
              <h2 className="eyebrow text-muted-foreground">Good to know</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                {notes.map((note) => (
                  <li key={note.id}>
                    {/* A note with an href is a link; one without is a statement. Both are rows
                        in the same group, because an operator should be able to turn one into
                        the other without moving it. */}
                    {note.href ? (
                      <Link
                        href={resolveNavHref(note, onLandingPage)}
                        className="transition-colors hover:text-foreground"
                      >
                        {note.label}
                      </Link>
                    ) : (
                      note.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {settings.site.name}. {settings.legal.copyright}
          </p>

          {legal.length > 0 ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {legal.map((link) => (
                <li key={link.id}>
                  <Link
                    href={resolveNavHref(link, onLandingPage)}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="eyebrow text-muted-foreground/70">Built on the open stack</p>
          )}
        </div>
      </div>
    </footer>
  )
}
