import Link from 'next/link'
import { Plus } from 'lucide-react'

import { SiteLogo } from '@/components/brand/site-logo'
import { AnnouncementBanner } from '@/components/marketing/announcement-banner'
import { AccountNotice, MaintenanceNotice } from '@/components/studio/account-notice'
import { SidebarNav } from '@/components/studio/sidebar-nav'
import { Topbar } from '@/components/studio/topbar'
import type { UserMenuProfile } from '@/components/studio/user-menu'
import { Button } from '@/components/ui/button'
import { getAccountState } from '@/lib/account-status'
import { isStaffRole } from '@/lib/admin/permissions'
import { isUnderMaintenance } from '@/lib/flags'
import { PresetCatalogueProvider } from '@/hooks/use-preset-catalogue'
import { getAnnouncement } from '@/services/cms/content.service'
import { getSettings } from '@/services/cms/settings.service'
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
 *
 * Two gates run before any of that, and both return a notice rather than a redirect.
 *
 * A suspended or banned account gets an explanation it can read, because a redirect to the
 * marketing site would leave somebody with no idea why the studio stopped working. This is the
 * enforcement point for the UI; the write endpoints check for themselves, since a suspended
 * account could otherwise still POST.
 *
 * Maintenance mode gates the studio and not the marketing site, so a visitor can still read what
 * the product is while it is being worked on. Staff are exempt — the person who turned it on is
 * usually the person who needs to verify the fix.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const [profile, presets, account, settings] = await Promise.all([
    getMyProfile(),
    listPresetCatalogue(),
    getAccountState(),
    getSettings(),
  ])

  const isStaff = isStaffRole(profile?.role)

  if (!account.active) {
    return <AccountNotice state={account} supportEmail={settings.site.supportEmail} />
  }

  if (await isUnderMaintenance(isStaff)) {
    return <MaintenanceNotice siteName={settings.site.name} />
  }

  const announcement = await getAnnouncement('studio')

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
        <Link href="/" className="rounded-md px-2" aria-label={`${settings.site.name}, home`}>
          <SiteLogo markClassName="size-7" />
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
        <Topbar profile={menuProfile} credits={profile?.credits ?? 0} isStaff={isStaff} />

        {announcement && (
          <div className="px-4 pt-4 sm:px-6">
            {/* The banner's own top margin clears the marketing site's fixed header, which the
                studio does not have — so it is reset here rather than in the component, which
                would need to know which shell it is inside. */}
            <div className="[&>div]:!mt-0 [&>div]:!px-0">
              <AnnouncementBanner announcement={announcement} />
            </div>
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PresetCatalogueProvider presets={presets}>{children}</PresetCatalogueProvider>
        </main>
      </div>
    </div>
  )
}
