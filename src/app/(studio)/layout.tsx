import Link from 'next/link'
import { Clapperboard } from 'lucide-react'

import { SidebarNav } from '@/components/studio/sidebar-nav'
import { Topbar } from '@/components/studio/topbar'
import type { UserMenuProfile } from '@/components/studio/user-menu'
import { siteConfig } from '@/config/site'
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
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border/60 p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary">
            <Clapperboard className="size-4 text-primary-foreground" />
          </span>
          <span className="text-sm font-semibold tracking-tight">{siteConfig.name}</span>
        </Link>

        <div className="flex-1">
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
