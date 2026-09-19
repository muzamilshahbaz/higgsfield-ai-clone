'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Loader2, LogOut, Settings, User } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface UserMenuProfile {
  displayName: string
  handle: string
  email: string | null
  avatarUrl: string | null
  initials: string
}

export function UserMenu({ profile }: { profile: UserMenuProfile }) {
  const [signingOut, startSignOut] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <Avatar>
          {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
          <AvatarFallback>{profile.initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            {profile.displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {profile.email ?? `@${profile.handle}`}
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
          <Link href="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/*
          Sign out is NOT a <form action={signOut}> inside this menu.
          Radix unmounts the menu content as soon as an item is selected, and
          that tore down the form while the Server Action was still in flight —
          the request was abandoned, the session survived, and the click looked
          like it did nothing.

          Holding the menu open with preventDefault() keeps this component
          mounted until the action's redirect navigates away, and gives the
          click visible feedback while the round trip happens.
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
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
