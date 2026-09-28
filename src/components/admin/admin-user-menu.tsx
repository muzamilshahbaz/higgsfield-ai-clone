'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ChevronsUpDown, ExternalLink, Loader2, LogOut, User } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { ReadOnlyBadge, useAdminReadOnly } from '@/components/admin/read-only'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Who you are signed in as, in the admin panel.
 *
 * The panel had a role badge and a link back to the studio; it did not have a way
 * to sign out, which meant an operator on a shared machine had to navigate back
 * into the product to leave. This is that menu: the account, the role it carries,
 * the profile, and the way out.
 *
 * The role line is not decoration. An operator who finds a button greyed out needs
 * to know it is their role rather than a broken screen, and this is the one place
 * on every page that says which role that is.
 */

export interface AdminMenuProfile {
  displayName: string
  handle: string
  email: string | null
  initials: string
  roleLabel: string
  roleDescription: string
}

export function AdminUserMenu({ profile }: { profile: AdminMenuProfile }) {
  const [signingOut, startSignOut] = useTransition()
  const { readOnly } = useAdminReadOnly()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-2 text-left text-sm outline-none transition-colors hover:border-border hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <Avatar className="size-7 shrink-0 border border-border">
          <AvatarFallback className="text-[10px]">{profile.initials}</AvatarFallback>
        </Avatar>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-tight">{profile.displayName}</span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">
            {profile.roleLabel}
          </span>
        </span>

        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            {profile.displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {profile.email ?? `@${profile.handle}`}
          </span>

          <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{profile.roleLabel}</Badge>
            {readOnly && <ReadOnlyBadge />}
          </span>
          <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">
            {profile.roleDescription}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <User />
            Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <ExternalLink />
            Back to the studio
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/*
          Not a <form action={signOut}>. Radix unmounts the menu content the moment
          an item is selected, which tore the form down mid-flight and left the
          session alive — see the same note in components/studio/user-menu.tsx.
          preventDefault keeps this mounted until the action's redirect lands.
        */}
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault()
            startSignOut(() => {
              void signOut()
            })
          }}
        >
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          {signingOut ? 'Signing out…' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
