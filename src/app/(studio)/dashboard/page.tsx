import Link from 'next/link'
import type { Metadata } from 'next'
import { Coins, FolderOpen, Images, Sparkles } from 'lucide-react'

import { JobFeed } from '@/components/gallery/job-feed'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { GenerationFeedProvider } from '@/hooks/use-generation-feed'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { getCurrentUser } from '@/lib/supabase/server'
import { countMyGenerations, listMyGenerations } from '@/services/generation.service'
import { getMyProfile } from '@/services/profile.service'
import { countMyProjects } from '@/services/project.service'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your studio at a glance.',
}

/**
 * Studio home.
 *
 * The recent strip is the same live feed the composer writes into, so a job
 * started on /create and finishing while the user is here updates in place
 * rather than waiting for a reload.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser()

  const [profile, projectCount, generationCount, generations] = await Promise.all([
    getMyProfile(),
    countMyProjects(),
    countMyGenerations(),
    listMyGenerations({ limit: 6 }),
  ])

  const firstName = profile?.display_name?.split(' ')[0] ?? profile?.handle ?? 'there'
  const credits = profile?.credits ?? 0

  const stats = [
    { label: 'Credits', value: credits.toLocaleString(), icon: Coins, href: '/settings' },
    { label: 'Projects', value: String(projectCount), icon: FolderOpen, href: '/projects' },
    { label: 'Generations', value: String(generationCount), icon: Images, href: '/library' },
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Recent generations</h2>
          {generationCount > generations.length && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/library">See all</Link>
            </Button>
          )}
        </div>

        {user ? (
          <GenerationFeedProvider userId={user.id} initialGenerations={generations}>
            <JobFeed
              showCount={false}
              emptyHint="Pick a camera move, drop in an image, and your first shot will appear here."
            />
          </GenerationFeedProvider>
        ) : null}
      </section>
    </div>
  )
}
