'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { KeyRound, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The settings tab bar.
 *
 * Routes, not Radix tabs. Each tab is a page that loads its own data on the
 * server — the profile tab reads the ledger, the keys tab reads the vault —
 * and a client-side tab component would mean fetching both on every visit and
 * losing the per-tab loading.tsx skeleton. Links also survive a refresh and
 * can be linked to directly, which a piece of component state cannot.
 *
 * `role="tablist"` is deliberately absent: these are links that navigate, and
 * announcing them as tabs would promise arrow-key semantics they do not have.
 * `aria-current` carries the state instead.
 */

const TABS = [
  { href: '/settings', label: 'Profile & credits', icon: UserRound },
  { href: '/settings/keys', label: 'AI model keys', icon: KeyRound },
] as const

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border">
      <nav aria-label="Settings sections" className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          // Exact match, not startsWith: `/settings/keys` also starts with
          // `/settings`, which would light both tabs at once.
          const active = pathname === tab.href
          const Icon = tab.icon

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
