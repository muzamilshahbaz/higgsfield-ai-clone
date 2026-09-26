import Link from 'next/link'
import { Plus } from 'lucide-react'

import { KineticLogo } from '@/components/brand/logo'
import { SidebarNav } from '@/components/studio/sidebar-nav'
import { Topbar } from '@/components/studio/topbar'
import type { UserMenuProfile } from '@/components/studio/user-menu'
import { Button } from '@/components/ui/button'
import { PresetCatalogueProvider } from '@/hooks/use-preset-catalogue'
import { listPresetCatalogue } from '@/services/preset.service'
import { getMyProfile, initialsFor } from '@/services/profile.service'

/**
 * The studio shell.
 *
 * Note this layout does NOT redirect signed-out visitors: `middleware.ts` owns
 * route protection, and it deliberately leaves /explore public. Putting a
 * second guard here would make Explore unreachable while signed out.
 *
 * The preset catalogue is read here, once, and shared through context: the
 * composer's picker, the gallery and the job cards all want it, and it is a
 * small public table that changes only when the catalogue is re-seeded.
 *
 * Layout: a fixed 244px rail on the left with the one primary action at the top
 * of it, and the page's own scroll on the right. The composer is the product, so
 * "New generation" is a button in the furniture rather than something a user has
 * to find on a page first.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const [profile, presets] = await Promise.all([getMyProfile(), listPresetCatalogue()])

  const menuProfile: UserMenuProfile | null = profile
    ? {
        displayName: profile.display_name ?? profile.handle,
        handle: profile.handle,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        initials: initialsFor(profile),
      }
    : null

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col gap-5 border-r border-border/70 bg-surface/25 px-3 py-4 lg:flex">
        <Link href="/" className="rounded-md px-2" aria-label="Kinetic Studio, home">
          <KineticLogo markClassName="size-7" />
        </Link>

        {/* Only rendered for a signed-in visitor: Explore is public, and a
            "New generation" button that bounces to sign-in is a dead end. */}
        {profile && (
          <Button asChild className="w-full justify-start px-3">
            <Link href="/create">
              <Plus className="size-4" aria-hidden />
              New generation
            </Link>
          </Button>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={menuProfile} credits={profile?.credits ?? 0} />

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PresetCatalogueProvider presets={presets}>{children}</PresetCatalogueProvider>
        </main>
      </div>
    </div>
  )
}
