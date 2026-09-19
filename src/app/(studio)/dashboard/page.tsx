import Link from 'next/link'
import type { Metadata } from 'next'
import { Clapperboard, Coins, FolderOpen, Images, Sparkles } from 'lucide-react'

import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { countMyProjects } from '@/services/project.service'
import { getMyProfile } from '@/services/profile.service'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your studio at a glance.',
}

/**
 * Studio home.
 *
 * Generation counts land in Phase 2 when the generations service exists; the
 * tiles read zero until then rather than being absent, so the layout does not
 * shift when the real numbers arrive.
 */
export default async function DashboardPage() {
  const [profile, projectCount] = await Promise.all([getMyProfile(), countMyProjects()])

  const firstName = profile?.display_name?.split(' ')[0] ?? profile?.handle ?? 'there'
  const credits = profile?.credits ?? 0

  const stats = [
    { label: 'Credits', value: credits.toLocaleString(), icon: Coins, href: '/settings' },
    { label: 'Projects', value: String(projectCount), icon: FolderOpen, href: '/projects' },
    { label: 'Generations', value: '0', icon: Images, href: '/library' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {credits >= SIGNUP_CREDIT_GRANT
              ? 'Your credits are untouched. Time to make the first shot.'
              : 'Pick up where you left off.'}
          </p>
        </div>

        <Button asChild>
          <Link href="/create">
            <Sparkles className="size-4" />
            New generation
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-0">
              <Link
                href={stat.href}
                className="flex items-center gap-4 p-5 transition-colors hover:bg-surface-2/50"
              >
                <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span>
                  <span className="block text-xl font-semibold tabular-nums">{stat.value}</span>
                  <span className="block text-xs text-muted-foreground">{stat.label}</span>
                </span>
              </Link>
            </Card>
          )
        })}
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Recent generations</h2>

        <EmptyState
          icon={Clapperboard}
          title="No generations yet"
          description="Pick a camera move, drop in an image, and your first shot will appear here."
          action={
            <Button asChild>
              <Link href="/create">Open the composer</Link>
            </Button>
          }
        />
      </section>
    </div>
  )
}
