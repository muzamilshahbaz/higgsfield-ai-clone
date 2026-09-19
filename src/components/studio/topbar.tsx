import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import { CreditPill } from '@/components/studio/credit-pill'
import { MobileNav } from '@/components/studio/mobile-nav'
import { UserMenu, type UserMenuProfile } from '@/components/studio/user-menu'
import { Button } from '@/components/ui/button'

/**
 * Studio topbar.
 *
 * `profile` is null on the one studio surface that is public (Explore), so the
 * same chrome serves signed-in and signed-out visitors without a second layout.
 */
export function Topbar({ profile, credits }: { profile: UserMenuProfile | null; credits: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <MobileNav />

        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/create">
                  <Sparkles className="size-4" />
                  Create
                </Link>
              </Button>
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
