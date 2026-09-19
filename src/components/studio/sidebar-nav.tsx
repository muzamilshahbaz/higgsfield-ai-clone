'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { studioFooterNav, studioNav } from '@/config/site'
import { cn } from '@/lib/utils'

/**
 * Sidebar links. Client-side only because the active state depends on the
 * current path — everything else in the shell stays a Server Component.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <nav className="space-y-1" aria-label="Studio">
        {studioNav.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-surface-2 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.title}
            </Link>
          )
        })}
      </nav>

      <nav className="space-y-1" aria-label="Account">
        {studioFooterNav.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-surface-2 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.title}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
