import Link from 'next/link'

import { KineticLogo } from '@/components/brand/logo'
import { MarketingMobileNav } from '@/components/marketing/marketing-mobile-nav'
import { Button } from '@/components/ui/button'
import { marketingNav } from '@/config/site'

/**
 * The marketing header.
 *
 * Floating rather than flush: the bar is inset from the viewport edges and
 * rounded, sitting on the page rather than being welded to it. That is the one
 * structural thing that reads differently at a glance from the full-width
 * frosted strip every other AI product ships, and it makes the graphite canvas
 * visible above the fold on all four sides.
 *
 * The desktop nav uses a 1px cyan underline that grows on hover instead of a
 * colour change, so the hover target is legible without the text moving.
 *
 * Shared with /g/[id], the public permalink page, which is why the signed-in
 * state is a prop rather than a read: that page already knows.
 */
export function SiteHeader({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="glass mx-auto flex h-14 max-w-7xl items-center justify-between rounded-xl border border-border/80 pl-3 pr-2 shadow-panel sm:h-16 sm:pl-5 sm:pr-3">
        <Link href="/" className="rounded-md" aria-label="Kinetic Studio, home">
          <KineticLogo markClassName="size-7 sm:size-8" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.title}
              <span
                className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-primary transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-x-100"
                aria-hidden
              />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Open the studio</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-up">Start creating</Link>
              </Button>
            </>
          )}

          <MarketingMobileNav isSignedIn={isSignedIn} />
        </div>
      </div>
    </header>
  )
}
