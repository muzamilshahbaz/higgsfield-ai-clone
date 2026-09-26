import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  Clapperboard,
  Coins,
  Compass,
  FolderOpen,
  KeyRound,
  Plus,
  Wand2,
} from 'lucide-react'

import { JobFeed } from '@/components/gallery/job-feed'
import { EmptyState } from '@/components/studio/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { RelativeTime } from '@/components/ui/relative-time'
import { GenerationFeedProvider } from '@/hooks/use-generation-feed'
import { getProvider } from '@/lib/ai/catalogue'
import { REASON_ICONS, REASON_LABELS } from '@/lib/credits'
import { cn } from '@/lib/utils'
import { getCurrentUser } from '@/lib/supabase/server'
import { listMyConnections } from '@/services/ai-keys.service'
import { getMyCreditSummary, listMyLedger } from '@/services/credits.service'
import { countMyGenerations, listMyGenerations } from '@/services/generation.service'
import { listPresetCatalogue } from '@/services/preset.service'
import { getMyProfile } from '@/services/profile.service'
import { listMyProjectSummaries } from '@/services/project.service'
import { planForUser } from '@/services/subscription.service'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your studio at a glance.',
}

const QUICK_PRESET_COUNT = 4
const RECENT_PROJECT_COUNT = 3
const ACTIVITY_COUNT = 5

/**
 * Studio home.
 *
 * Laid out as a workspace, not an admin panel: the left column is work — start
 * something, then what you have running and what you have filed — and the right
 * rail is state, the numbers you glance at rather than act on.
 *
 * The one deliberate structural choice is that Quick Create comes before any
 * statistic. The point of opening this page is to make something; a row of
 * counters above the fold is an analytics dashboard wearing a studio's clothes.
 *
 * The recent strip is the same live feed the composer writes into, so a job
 * started on /create and finishing while the user is here updates in place
 * rather than waiting for a reload.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser()

  const [profile, projects, generationCount, generations, presets, summary, ledger, connections] =
    await Promise.all([
      getMyProfile(),
      listMyProjectSummaries(),
      countMyGenerations(),
      listMyGenerations({ limit: 6 }),
      listPresetCatalogue(),
      getMyCreditSummary(),
      listMyLedger(ACTIVITY_COUNT),
      listMyConnections(),
    ])

  // `planForUser` needs the id and is the same resolver the generation service
  // enforces with, so the tier shown here is the tier that will be applied.
  const plan = user ? await planForUser(user.id) : null

  const firstName = profile?.display_name?.split(' ')[0] ?? profile?.handle ?? 'there'
  const credits = profile?.credits ?? 0

  const featuredPresets = presets.filter((preset) => preset.isFeatured).slice(0, QUICK_PRESET_COUNT)
  const recentProjects = [...projects]
    .sort((a, b) => (b.lastActivityAt ?? b.created_at).localeCompare(a.lastActivityAt ?? a.created_at))
    .slice(0, RECENT_PROJECT_COUNT)

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* ------------------------------------------------------- welcome */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Studio</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Welcome back, {firstName}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {generationCount === 0
              ? 'Nothing rendered yet. Pick a preset below and make the first one.'
              : `${generationCount.toLocaleString()} ${generationCount === 1 ? 'generation' : 'generations'} so far, across ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {plan && <Badge variant="outline">{plan.name} plan</Badge>}
          <Button asChild>
            <Link href="/create">
              <Plus className="size-4" aria-hidden />
              New generation
            </Link>
          </Button>
        </div>
      </header>

      {/* --------------------------------------------------- quick create */}
      <QuickCreate presets={featuredPresets} />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------- work column */}
        <div className="space-y-8 lg:col-span-8">
          <section aria-labelledby="recent-generations">
            <SectionBar
              id="recent-generations"
              title="Recent generations"
              action={
                generationCount > generations.length ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/library">
                      See all
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                ) : null
              }
            />

            <div className="mt-4">
              {user ? (
                <GenerationFeedProvider userId={user.id} initialGenerations={generations}>
                  <JobFeed
                    showCount={false}
                    emptyHint="Pick a camera move, drop in an image, and your first shot will appear here."
                  />
                </GenerationFeedProvider>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="recent-projects">
            <SectionBar
              id="recent-projects"
              title="Recent projects"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/projects">
                    All projects
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </Button>
              }
            />

            <div className="mt-4">
              {recentProjects.length === 0 ? (
                <EmptyState
                  headingLevel={3}
                  icon={FolderOpen}
                  title="No projects yet"
                  description="Projects hold the shots that belong together. One is created for you the first time you generate."
                />
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {recentProjects.map((project) => (
                    <li key={project.id}>
                      <Card interactive className="h-full overflow-hidden p-0">
                        <Link href={`/projects/${project.id}`} className="block">
                          <div className="relative aspect-video overflow-hidden bg-surface-2">
                            {project.previewUrl ? (
                              project.previewIsVideo ? (
                                <video
                                  src={project.previewUrl}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="size-full object-cover"
                                />
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={project.previewUrl}
                                  alt=""
                                  loading="lazy"
                                  className="size-full object-cover"
                                />
                              )
                            ) : (
                              <div className="blueprint size-full opacity-50" aria-hidden />
                            )}
                          </div>

                          <div className="p-4">
                            <p className="truncate font-display text-sm font-medium">
                              {project.title}
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="tabular-nums">
                                {project.generationCount}{' '}
                                {project.generationCount === 1 ? 'shot' : 'shots'}
                              </span>
                              {project.lastActivityAt && (
                                <>
                                  <span aria-hidden>·</span>
                                  <RelativeTime value={project.lastActivityAt} />
                                </>
                              )}
                            </p>
                          </div>
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ------------------------------------------------- status rail */}
        <aside className="space-y-4 lg:col-span-4">
          <CreditsCard credits={credits} plan={plan?.credits ?? null} planName={plan?.name ?? null} />
          <UsageCard summary={summary} generationCount={generationCount} />
          <ConnectedModelsCard connections={connections} />
          <ActivityCard entries={ledger} />
        </aside>
      </div>
    </div>
  )
}

/** A section rule with a heading on it, so the two columns share one rhythm. */
function SectionBar({
  id,
  title,
  action,
}: {
  id: string
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4">
      <h2 id={id} className="eyebrow text-muted-foreground">
        {title}
      </h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
      {action}
    </div>
  )
}

/**
 * Quick create.
 *
 * Three destinations and up to four one-click presets. The preset tiles use
 * `/create?preset=<slug>`, a deep link the composer already supports, so a
 * click lands on a composer with the model, the prompt language and the
 * parameters already set — which is the shortest path to a first render this
 * product has.
 */
function QuickCreate({
  presets,
}: {
  presets: Awaited<ReturnType<typeof listPresetCatalogue>>
}) {
  const shortcuts = [
    {
      href: '/create',
      icon: Clapperboard,
      title: 'Open the composer',
      body: 'Prompt, model and reference image.',
    },
    {
      href: '/presets',
      icon: Wand2,
      title: 'Browse presets',
      body: 'Camera moves and film styles.',
    },
    {
      href: '/explore',
      icon: Compass,
      title: 'Remix from Explore',
      body: 'Start from what someone else made.',
    },
  ]

  return (
    <section aria-labelledby="quick-create" className="panel rounded-2xl p-5 sm:p-6">
      <h2 id="quick-create" className="font-display text-lg font-medium">
        Start something
      </h2>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon
          return (
            <li key={shortcut.href}>
              <Link
                href={shortcut.href}
                className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-4 transition-colors hover:border-brand/40 hover:bg-surface-2/70"
              >
                <span className="chip-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{shortcut.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {shortcut.body}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      {presets.length > 0 && (
        <>
          <p className="eyebrow mt-6 text-muted-foreground">Or start from a preset</p>

          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {presets.map((preset) => (
              <li key={preset.slug}>
                <Link
                  href={`/create?preset=${preset.slug}`}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors hover:border-brand/50"
                >
                  {preset.posterUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={preset.posterUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-3">
                    <span className="block truncate text-sm font-medium">{preset.title}</span>
                    <span className="eyebrow mt-1 block truncate text-muted-foreground">
                      {preset.category}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * The credit balance.
 *
 * The bar is the balance against the plan's monthly allowance, which is the
 * only honest denominator available — it is not a quota being consumed so much
 * as how much of a month's worth is left in hand. Above 100% (a top-up, or
 * credits carried over) it clamps rather than overflowing the track.
 */
function CreditsCard({
  credits,
  plan,
  planName,
}: {
  credits: number
  plan: number | null
  planName: string | null
}) {
  const ratio = plan && plan > 0 ? credits / plan : null
  const low = credits < 40

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-muted-foreground">Credits</p>
          <p
            className={cn(
              'mt-3 font-display text-4xl font-semibold leading-none tabular-nums',
              low ? 'text-warning' : 'text-credit',
            )}
          >
            {credits.toLocaleString()}
          </p>
        </div>
        <span className="chip-brand flex size-9 items-center justify-center rounded-lg">
          <Coins className="size-4" aria-hidden />
        </span>
      </div>

      {ratio !== null && (
        <div className="mt-4">
          <Progress value={ratio} label={`${credits} of ${plan} credits remaining`} />
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            of {plan?.toLocaleString()} on {planName}
          </p>
        </div>
      )}

      <Button asChild variant="outline" size="sm" className="mt-5 w-full">
        <Link href="/settings/billing">
          {low ? 'Top up credits' : 'Manage plan'}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Button>
    </Card>
  )
}

/** Lifetime totals from the ledger, which is the only place they are true. */
function UsageCard({
  summary,
  generationCount,
}: {
  summary: { earned: number; spent: number; refunded: number }
  generationCount: number
}) {
  const rows = [
    { label: 'Generations', value: generationCount.toLocaleString() },
    { label: 'Credits spent', value: summary.spent.toLocaleString() },
    { label: 'Granted', value: summary.earned.toLocaleString() },
    { label: 'Refunded', value: summary.refunded.toLocaleString() },
  ]

  return (
    <Card className="p-5">
      <p className="eyebrow text-muted-foreground">Usage, all time</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dd className="font-display text-xl font-semibold tabular-nums">{row.value}</dd>
            <dt className="mt-0.5 text-xs text-muted-foreground">{row.label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/**
 * Connected providers.
 *
 * Lists what is actually connected and links to the keys page when nothing is.
 * `listMyConnections` returns masked metadata only — no decrypted key reaches a
 * component, here or anywhere.
 */
function ConnectedModelsCard({
  connections,
}: {
  connections: Awaited<ReturnType<typeof listMyConnections>>
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-muted-foreground">Connected models</p>
        <Link
          href="/settings/keys"
          className="text-xs font-medium text-brand underline-offset-4 hover:underline"
        >
          Manage
        </Link>
      </div>

      {connections.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            No provider keys connected. Generations run on the studio account and your credit
            balance.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link href="/settings/keys">
              <KeyRound className="size-3.5" aria-hidden />
              Connect a provider
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {connections.map((connection) => {
            const provider = getProvider(connection.provider)
            const verified = connection.status === 'valid'

            return (
              <li key={connection.provider} className="flex items-center gap-3">
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    verified ? 'bg-success' : 'bg-warning',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {provider?.label ?? connection.provider}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {connection.masked}
                  </span>
                </span>
                <Badge variant={verified ? 'success' : 'warning'}>
                  {verified ? 'Verified' : 'Unverified'}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** The last few credit movements — the closest thing this app has to a log. */
function ActivityCard({
  entries,
}: {
  entries: Awaited<ReturnType<typeof listMyLedger>>
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-muted-foreground">Activity</p>
        <Link
          href="/settings/billing"
          className="text-xs font-medium text-brand underline-offset-4 hover:underline"
        >
          Full ledger
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing has moved yet. Your welcome grant will be the first entry.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => {
            const Icon = REASON_ICONS[entry.reason]
            const positive = entry.delta > 0

            return (
              <li key={entry.id} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{REASON_LABELS[entry.reason]}</span>
                  <RelativeTime
                    value={entry.created_at}
                    className="block text-xs text-muted-foreground"
                  />
                </span>

                <span
                  className={cn(
                    'shrink-0 text-sm font-medium tabular-nums',
                    positive ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {positive ? '+' : ''}
                  {entry.delta}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
