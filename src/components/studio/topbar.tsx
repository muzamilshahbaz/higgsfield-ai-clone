import Link from 'next/link'

import { KineticLogo } from '@/components/brand/logo'
import { CreditPill } from '@/components/studio/credit-pill'
import { MobileNav } from '@/components/studio/mobile-nav'
import { UserMenu, type UserMenuProfile } from '@/components/studio/user-menu'
import { Button } from '@/components/ui/button'

/**
 * Studio topbar.
 *
 * `profile` is null on the one studio surface that is public (Explore), so the
 * same chrome serves signed-in and signed-out visitors without a second layout.
 *
 * The logo appears here only below `lg`, where the sidebar that normally
 * carries it is collapsed into the menu — a second wordmark beside the rail
 * would be the same brand twice on one screen.
 */
export function Topbar({ profile, credits }: { profile: UserMenuProfile | null; credits: number }) {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border/70">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <MobileNav />

        <Link href="/" className="rounded-md lg:hidden" aria-label="Kinetic Studio, home">
          <KineticLogo compact markClassName="size-7" />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <CreditPill credits={credits} />
              <UserMenu profile={profile} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Start creating</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
