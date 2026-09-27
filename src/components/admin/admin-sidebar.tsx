'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Menu, ShieldCheck, X } from 'lucide-react'

import type { AdminNavGroup } from '@/lib/admin/nav'
import { navIcon } from '@/lib/admin/nav-icons'
import { ROLE_LABELS } from '@/lib/admin/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types/database'

/**
 * The admin navigation.
 *
 * One component, two renderings: a fixed rail on desktop and a sheet on mobile. The
 * same `groups` array drives both, and it arrives already filtered to what the
 * operator's role can see — `navFor(role)` runs on the server, so the browser is
 * never handed a list of sections it would then have to hide.
 *
 * Active state is computed from the pathname rather than passed in, because the
 * layout renders once and the rail has to keep up with client-side navigation. The
 * longest-match rule is the interesting part: `/admin/providers/keys` is under both
 * `/admin` and `/admin/providers`, and only one of those should light up.
 */

export function AdminSidebar({
  groups,
  role,
  handle,
}: {
  groups: AdminNavGroup[]
  role: UserRole
  handle: string
}) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()

  // A tap on a link in the sheet navigates and the sheet has to close, or the
  // operator lands on a page they cannot see. Keyed on the pathname so it closes
  // on arrival rather than on click, which also handles the back button.
  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* ------------------------------------------------------- mobile bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand" aria-hidden />
          <span className="font-display text-sm font-medium">Admin</span>
        </Link>

        <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-expanded={open}>
          <Menu className="size-4" aria-hidden />
          Sections
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close the navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-display text-sm font-medium">Sections</p>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}>
                <X className="size-4" aria-hidden />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <NavList groups={groups} pathname={pathname} />
            </div>
            <Footer role={role} handle={handle} />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-border bg-surface/30 lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <ShieldCheck className="size-5 text-brand" aria-hidden />
          <span className="font-display text-sm font-medium">Kinetic Admin</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <NavList groups={groups} pathname={pathname} />
        </div>

        <Footer role={role} handle={handle} />
      </aside>
    </>
  )
}

function NavList({ groups, pathname }: { groups: AdminNavGroup[]; pathname: string }) {
  // Computed once per render rather than per item: the longest-match rule needs the
  // whole set to decide, and doing it inside the map would be quadratic for no
  // reason.
  const activeHref = React.useMemo(() => {
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href))
    return hrefs
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0]
  }, [groups, pathname])

  return (
    <nav className="space-y-5" aria-label="Admin sections">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="eyebrow px-2 pb-2 text-muted-foreground/70">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              // The name arrived as a string; this is where it becomes a component. See the note
              // on `AdminNavItem.icon`.
              const Icon = navIcon(item.icon)
              const active = item.href === activeHref
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={item.description}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary/12 font-medium text-brand'
                        : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Who you are signed in as, and the way back to the product.
 *
 * The role badge is not decoration: an operator who cannot do something needs to
 * know it is their role rather than a broken button, and this is the one place that
 * says so on every screen.
 */
function Footer({ role, handle }: { role: UserRole; handle: string }) {
  return (
    <div className="shrink-0 space-y-2 border-t border-border px-3 py-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 truncate text-xs text-muted-foreground">@{handle}</p>
        <Badge variant="outline" className="shrink-0">
          {ROLE_LABELS[role]}
        </Badge>
      </div>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2/70 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to the studio
      </Link>
    </div>
  )
}
