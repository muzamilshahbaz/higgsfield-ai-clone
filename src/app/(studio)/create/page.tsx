import Link from 'next/link'
import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'

import { Composer } from '@/components/composer/composer'
import { JobFeed } from '@/components/gallery/job-feed'
import { Button } from '@/components/ui/button'
import { GenerationFeedProvider } from '@/hooks/use-generation-feed'
import { isServiceRoleConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'
import { buildRemixDraft } from '@/lib/remix'
import { getGeneration, listMyGenerations } from '@/services/generation.service'
import { getPresetById, getPresetBySlug } from '@/services/preset.service'
import { getMyProfile } from '@/services/profile.service'
import { ensureDefaultProject, listMyProjects } from '@/services/project.service'

export const metadata: Metadata = {
  title: 'Create',
  description: 'Pick a preset, drop in a frame, and generate.',
}

/**
 * The product surface: composer on the left, live feed on the right.
 *
 * The initial rows are server-rendered so the feed is never empty for a frame
 * on reload; everything after that arrives over Realtime and the ticker.
 *
 * Three deep links land here, and every one of them degrades to a plain
 * composer rather than an error page, because each is something a user can
 * bookmark and come back to weeks later:
 *   `?preset=<slug>`   the gallery's "Use preset"
 *   `?project=<uuid>`  a project's "Add to this project"
 *   `?image=<url>`     the library's "Use as start frame"
 *   `?remix=<uuid>`    Explore's "Remix this"
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; project?: string; image?: string; remix?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) return <NotSignedIn />

  const {
    preset: presetSlug,
    project: projectParam,
    image: imageParam,
    remix: remixParam,
  } = await searchParams

  const [profile, defaultProjectId, projects, generations, presetFromSlug, remixSource] =
    await Promise.all([
      getMyProfile(),
      ensureDefaultProject(),
      listMyProjects(),
      listMyGenerations({ limit: 24 }),
      presetSlug ? getPresetBySlug(presetSlug) : Promise.resolve(null),
      // Read through RLS, which resolves to the caller's own rows plus anything
      // published — exactly what a remix is allowed to start from. A private
      // shot belonging to someone else comes back null and the composer simply
      // opens empty.
      remixParam ? getGeneration(remixParam) : Promise.resolve(null),
    ])

  const remix = remixSource
    ? buildRemixDraft(remixSource, { isOwn: remixSource.user_id === user.id })
    : null

  // A remix brings its own preset; a `?preset=` slug only wins when there is
  // no remix to contradict it.
  const remixPreset = remix?.presetId
    ? (await getPresetById(remix.presetId))
    : null
  const preset = remix ? remixPreset : presetFromSlug

  // Checked against the user's own projects rather than trusted: a stale or
  // borrowed id silently falls back to the default project.
  const requestedProject = projectParam
    ? projects.find((project) => project.id === projectParam)
    : undefined
  const projectId = requestedProject?.id ?? defaultProjectId

  // Only http(s) and same-origin paths, so `?image=javascript:…` cannot reach
  // an `src`. The same rule the generation schema enforces on the way in.
  const startFrame =
    imageParam && (imageParam.startsWith('/') || /^https?:\/\//i.test(imageParam))
      ? imageParam
      : null

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="eyebrow text-muted-foreground">Compose</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Create</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Describe the shot, pick a model, and watch it render.
        </p>
      </header>

      {!isServiceRoleConfigured && <ServiceRoleWarning />}

      <GenerationFeedProvider userId={user.id} initialGenerations={generations}>
        {/*
          The composer sticks below the topbar while the results scroll. 400px
          is the narrowest the control column reads well at — below that the
          aspect-ratio chips wrap to three lines and the panel stops looking
          like an instrument.
        */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-20">
            <Composer
              credits={profile?.credits ?? 0}
              projectId={projectId}
              projects={projects.map((project) => ({
                id: project.id,
                title: project.title,
                isDefault: project.is_default,
              }))}
              initialPreset={preset}
              initialImageUrl={startFrame}
              initialRemix={remix}
            />
          </div>

          <section aria-labelledby="results">
            <div className="flex items-center gap-4">
              <h2 id="results" className="eyebrow text-muted-foreground">
                Results
              </h2>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <div className="mt-4">
              <JobFeed />
            </div>
          </section>
        </div>
      </GenerationFeedProvider>
    </div>
  )
}

function NotSignedIn() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">Sign in to create</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Generations are tied to your account and your credit balance.
      </p>
      <Button asChild className="mt-6">
        <Link href="/sign-in?next=/create">Sign in</Link>
      </Button>
    </div>
  )
}

/**
 * Honest about a missing key rather than failing at the first Generate click.
 * The composer stays interactive so the surface can still be reviewed.
 */
function ServiceRoleWarning() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div>
        <p className="font-medium text-foreground">Generation is disabled</p>
        <p className="mt-0.5 text-muted-foreground">
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
          is not set, so credits cannot be reserved. Add it to{' '}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">.env.local</code> and restart.
        </p>
      </div>
    </div>
  )
}
