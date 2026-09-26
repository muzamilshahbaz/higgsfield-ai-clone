'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { settingsNav } from '@/config/site'
import { cn } from '@/lib/utils'

/**
 * The settings tab bar.
 *
 * Routes, not Radix tabs. Each tab is a page that loads its own data on the
 * server — the profile tab reads the ledger, the keys tab reads the vault —
 * and a client-side tab component would mean fetching both on every visit and
 * losing the per-tab loading.tsx skeleton. Links also survive a refresh and can
 * be linked to directly, which a piece of component state cannot.
 *
 * `role="tablist"` is deliberately absent: these are links that navigate, and
 * announcing them as tabs would promise arrow-key semantics they do not have.
 * `aria-current` carries the state instead.
 *
 * Presented as a contained segmented control rather than an underline. The
 * underline version shared its border with the page and read as a heading rule
 * someone had accidentally made clickable; a raised chip inside a track reads
 * as a control, which is what it is.
 */

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="inline-flex gap-1 rounded-xl border border-border bg-surface/40 p-1">
        {settingsNav.map((tab) => {
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
                'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-surface-2 font-medium text-foreground shadow-panel'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4', active && 'text-brand')} aria-hidden />
              {tab.title}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * The shared settings header.
 *
 * It exists because all three tabs previously rendered the same hard-coded
 * subtitle — "Your profile and your credit ledger" — including the two tabs
 * that are about neither. One component with a required `description` makes
 * that class of copy-paste impossible.
 */
export function SettingsHeader({ description }: { description: string }) {
  return (
    <header>
      <p className="eyebrow text-muted-foreground">Account</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Settings</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
    </header>
  )
}
