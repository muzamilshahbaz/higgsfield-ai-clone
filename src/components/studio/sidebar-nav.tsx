'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Settings } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { settingsNav, studioNavGroups } from '@/config/site'
import { cn } from '@/lib/utils'

/**
 * Sidebar links. Client-side only because the active state depends on the
 * current path — everything else in the shell stays a Server Component.
 *
 * The active row is marked three ways at once: a cyan bar on the left edge, a
 * tinted background, and a cyan icon. That is not redundancy for its own sake —
 * the bar survives a colour-blind reader, the tint survives a greyscale screen,
 * and `aria-current="page"` carries it for anyone not looking at all.
 */
export function SidebarNav({
  onNavigate,
  inlineSettings = false,
}: {
  onNavigate?: () => void
  /**
   * Renders the settings sections as a listed group instead of a flyout.
   *
   * The mobile slide-over passes this. A right-hand flyout out of a 272px panel
   * runs off a 375px screen — Radix cannot shift it back, because there is no
   * room on either side — and a popup nested inside a modal with its own focus
   * trap is a fight over focus that nobody wins. The panel has vertical space
   * to spare, so on mobile the three links are simply there.
   */
  inlineSettings?: boolean
}) {
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-6">
        {studioNavGroups.map((group) => (
          <nav key={group.label} aria-label={group.label}>
            <h2 className="eyebrow px-3 pb-2 text-muted-foreground/70">{group.label}</h2>

            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavRow
                    href={item.href}
                    icon={item.icon}
                    title={item.title}
                    active={isActive(item.href)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {inlineSettings ? (
        <nav aria-label="Account">
          <h2 className="eyebrow px-3 pb-2 text-muted-foreground/70">Settings</h2>

          <ul className="space-y-0.5">
            {settingsNav.map((item) => (
              <li key={item.href}>
                <NavRow
                  href={item.href}
                  icon={item.icon}
                  title={item.title}
                  // Exact match: `/settings/keys` also starts with `/settings`,
                  // which would light both Profile and AI model keys at once.
                  active={pathname === item.href}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <SettingsMenu onNavigate={onNavigate} />
      )}
    </div>
  )
}

/**
 * Settings, as a menu rather than a link.
 *
 * The three settings sections are siblings, not a page with sub-pages, so the
 * sidebar offers all three instead of dropping you on the first one and making
 * you find a tab bar. Going to billing is one click from anywhere now rather
 * than two.
 *
 * `side="right"` because the rail is pinned to the left edge: a menu opening
 * downward would fall off the bottom of a short viewport, and one opening left
 * would leave the window.
 */
function SettingsMenu({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  // Any settings route lights the trigger, so the sidebar still tells you where
  // you are while the menu is shut.
  const withinSettings = pathname === '/settings' || pathname.startsWith('/settings/')

  return (
    <nav aria-label="Account">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'relative flex w-full items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-sm outline-none transition-colors',
            withinSettings
              ? 'bg-surface-2/70 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-surface hover:text-foreground',
          )}
        >
          {withinSettings && (
            <span
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
              aria-hidden
            />
          )}
          <Settings className={cn('size-4 shrink-0', withinSettings && 'text-brand')} aria-hidden />
          Settings
          {/* Points the way the menu opens, rather than the down-chevron a
              select would use — this one flies out to the right. */}
          <ChevronRight className="ml-auto size-3.5 shrink-0 opacity-60" aria-hidden />
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-64">
          <DropdownMenuLabel>Settings</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {settingsNav.map((item) => {
            const Icon = item.icon
            // Exact match, not startsWith: `/settings/keys` also starts with
            // `/settings`, which would tick two items at once.
            const active = pathname === item.href

            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className="items-start gap-3"
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', active && 'text-brand')} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', active && 'font-medium text-foreground')}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}

function NavRow({
  href,
  icon: Icon,
  title,
  active,
  onNavigate,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-sm transition-colors',
        active
          ? 'bg-surface-2/70 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-surface hover:text-foreground',
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
          aria-hidden
        />
      )}
      <Icon className={cn('size-4 shrink-0', active && 'text-brand')} />
      {title}
    </Link>
  )
}
