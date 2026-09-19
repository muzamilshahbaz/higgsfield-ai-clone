import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Coins } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatRelativeTime } from '@/lib/utils'
import { getMyProfile, initialsFor } from '@/services/profile.service'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your profile and credit balance.',
}

export default async function SettingsPage() {
  const profile = await getMyProfile()

  // Middleware already guards this route; this is the belt-and-braces case
  // where the session expires between the middleware check and the render.
  if (!profile) redirect('/sign-in?next=/settings')

  const fields = [
    { label: 'Name', value: profile.display_name ?? '—' },
    { label: 'Handle', value: `@${profile.handle}` },
    { label: 'Email', value: profile.email ?? '—' },
    { label: 'Member since', value: formatRelativeTime(profile.created_at) },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your profile and credit balance.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="text-base">{initialsFor(profile)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="truncate text-lg font-medium">
              {profile.display_name ?? profile.handle}
            </p>
            <p className="truncate text-sm text-muted-foreground">@{profile.handle}</p>
          </div>

          {profile.role === 'admin' && (
            <Badge className="ml-auto" variant="secondary">
              Admin
            </Badge>
          )}
        </div>

        <Separator className="my-6" />

        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="mt-0.5 truncate text-sm">{field.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-xs text-muted-foreground">
          Editing your profile arrives with the settings surface in Phase 4.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface">
            <Coins className="size-4 text-credit" aria-hidden />
          </span>
          <div>
            <p className="text-xl font-semibold tabular-nums">
              {profile.credits.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">credits available</p>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Every debit and refund is written to an append-only ledger. The full history appears
          here in Phase 4.
        </p>
      </Card>
    </div>
  )
}
