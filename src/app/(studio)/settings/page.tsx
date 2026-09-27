import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight, Coins, Download, Globe2, Heart, Lock, MessageCircle, Star } from 'lucide-react'

import { ProfileForm } from '@/components/settings/profile-form'
import { SettingsHeader, SettingsTabs } from '@/components/settings/settings-tabs'
import { LedgerTable } from '@/components/settings/ledger-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatRelativeTime } from '@/lib/utils'
import { getMyCreditSummary, listMyLedgerPage } from '@/services/credits.service'
import { getMyCreatorStats, getMyProfile, initialsFor } from '@/services/profile.service'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your profile and your credit ledger.',
}

const LEDGER_PAGE = 50
const LEDGER_MAX = 500

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ledger?: string }>
}) {
  const { ledger } = await searchParams

  // Clamped, because this number comes straight from the URL and drives a
  // range query: a hand-typed `?ledger=999999` should not become one.
  const requested = Number(ledger)
  const shown =
    Number.isFinite(requested) && requested > LEDGER_PAGE
      ? Math.min(Math.floor(requested), LEDGER_MAX)
      : LEDGER_PAGE

  const [profile, ledgerPage, summary, creator] = await Promise.all([
    getMyProfile(),
    listMyLedgerPage(shown),
    getMyCreditSummary(),
    getMyCreatorStats(),
  ])

  // Middleware already guards this route; this is the belt-and-braces case
  // where the session expires between the middleware check and the render.
  if (!profile) redirect('/sign-in?next=/settings')

  const stats = [
    { label: 'Available', value: profile.credits, icon: Coins, tone: 'text-credit' },
    { label: 'Spent', value: summary.spent, icon: ArrowUpRight, tone: 'text-muted-foreground' },
    { label: 'Refunded', value: summary.refunded, icon: ArrowDownLeft, tone: 'text-success' },
  ]

  /**
   * What this creator's work has earned.
   *
   * Four numbers, none of them a vanity metric by accident: likes and
   * favourites are what other people did, downloads are what they took away,
   * and the public/private split is the one number that tells you why the
   * other three might be zero.
   */
  const reach = [
    { label: 'Public', value: creator.publicCount, icon: Globe2, tone: 'text-brand' },
    { label: 'Private', value: creator.privateCount, icon: Lock, tone: 'text-muted-foreground' },
    { label: 'Likes received', value: creator.likesReceived, icon: Heart, tone: 'text-danger' },
    { label: 'Saved by others', value: creator.favouritesReceived, icon: Star, tone: 'text-accent' },
    {
      label: 'Downloads',
      value: creator.downloadsReceived,
      icon: Download,
      tone: 'text-muted-foreground',
    },
    {
      label: 'Comments',
      value: creator.commentsReceived,
      icon: MessageCircle,
      tone: 'text-muted-foreground',
    },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SettingsHeader description="Your profile, your credit balance and every movement behind it." />

      <SettingsTabs />

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="text-base">{initialsFor(profile)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="truncate font-display text-lg font-medium">
              {profile.display_name ?? profile.handle}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {profile.email ?? `@${profile.handle}`} · joined{' '}
              {formatRelativeTime(profile.created_at)}
            </p>
          </div>

          {profile.role === 'admin' && (
            <Badge className="ml-auto" variant="secondary">
              Admin
            </Badge>
          )}
        </div>

        <Separator className="my-6" />

        <ProfileForm profile={profile} />
      </Card>

      <Card className="p-6" id="reach">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow text-muted-foreground">Your work</h2>
          <p className="text-xs text-muted-foreground">
            Counted across everything you have made that is not deleted.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {reach.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                  <Icon className={`size-4 ${stat.tone}`} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span
                    className={`block font-display text-2xl font-semibold tabular-nums ${stat.tone}`}
                  >
                    {stat.value.toLocaleString()}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {stat.label}
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        {creator.publicCount === 0 && (
          <p className="mt-5 rounded-lg border border-dashed border-border bg-surface/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            Nothing of yours is public yet, which is why the rest of these are zero. Publishing a
            shot from your library puts it in Explore, where people can like, save and download it.
          </p>
        )}
      </Card>

      <Card className="p-6" id="ledger">
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                  <Icon className={`size-4 ${stat.tone}`} aria-hidden />
                </span>
                <span>
                  <span
                    className={`block font-display text-2xl font-semibold tabular-nums ${stat.tone}`}
                  >
                    {stat.value.toLocaleString()}
                  </span>
                  <span className="block text-xs text-muted-foreground">{stat.label}</span>
                </span>
              </div>
            )
          })}
        </div>

        <Separator className="my-6" />

        <div className="space-y-4">
          <div>
            <h2 className="eyebrow text-muted-foreground">Credit ledger</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Append-only. Every debit is written when a job is submitted and every refund when
              one fails, so this always adds up to your balance.
            </p>
          </div>

          <LedgerTable
            entries={ledgerPage.entries}
            total={ledgerPage.total}
            shown={shown}
            step={LEDGER_PAGE}
          />
        </div>
      </Card>
    </div>
  )
}
