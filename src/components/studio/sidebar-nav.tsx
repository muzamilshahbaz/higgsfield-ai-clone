'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { studioFooterNav, studioNavGroups } from '@/config/site'
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
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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

      <nav aria-label="Account">
        <ul className="space-y-0.5">
          {studioFooterNav.map((item) => (
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
    </div>
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
