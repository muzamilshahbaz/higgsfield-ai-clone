import Link from 'next/link'

import { KineticLogo } from '@/components/brand/logo'
import { MarketingMobileNav } from '@/components/marketing/marketing-mobile-nav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { marketingNav, resolveMarketingHref } from '@/config/site'
import { initialsFor, type Profile } from '@/services/profile.service'
import { cn } from '@/lib/utils'

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
 * Shared by `/`, `/explore` and `/g/[id]`, which is why the signed-in state is
 * a prop rather than a read: all three already know. `onLandingPage` decides
 * whether the section links are bare anchors or `/#anchor`, because a
 * `#pricing` rendered on Explore points at a section that is not there.
 */
export function SiteHeader({
  isSignedIn = false,
  profile = null,
  onLandingPage = false,
}: {
  isSignedIn?: boolean
  /**
   * Shown as an avatar beside the Dashboard button. Optional: a page that has
   * not read the profile gets the button alone rather than a second query it
   * did not ask for.
   */
  profile?: Profile | null
  onLandingPage?: boolean
}) {
  const signedIn = isSignedIn || Boolean(profile)

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
              href={resolveMarketingHref(item, onLandingPage)}
              className={cn(
                'group relative rounded-md px-3 py-2 text-sm transition-colors',
                // Explore is a destination, not a scroll target, so it carries
                // slightly more weight than the section links beside it.
                item.route
                  ? 'font-medium text-foreground/90 hover:text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
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
          {signedIn ? (
            <>
              <Button asChild size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>

              {profile && (
                // A link to settings rather than a menu: the studio already
                // has a full account menu, and a second one in the public
                // header would be two places to sign out from.
                <Link
                  href="/settings"
                  aria-label={`Your account — ${profile.display_name ?? profile.handle}`}
                  className="rounded-full ring-offset-2 ring-offset-background transition-opacity hover:opacity-80"
                >
                  <Avatar className="size-8 border border-border">
                    {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                    <AvatarFallback className="text-[11px]">
                      {initialsFor(profile)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              )}
            </>
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

          <MarketingMobileNav isSignedIn={signedIn} onLandingPage={onLandingPage} />
        </div>
      </div>
    </header>
  )
}
