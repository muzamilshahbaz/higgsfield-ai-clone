import Link from 'next/link'
import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'

import { Composer } from '@/components/composer/composer'
import { JobFeed } from '@/components/gallery/job-feed'
import { Button } from '@/components/ui/button'
import { GenerationFeedProvider } from '@/hooks/use-generation-feed'
import { isServiceRoleConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'
import { listMyGenerations } from '@/services/generation.service'
import { getPresetBySlug } from '@/services/preset.service'
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
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; project?: string; image?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) return <NotSignedIn />

  const { preset: presetSlug, project: projectParam, image: imageParam } = await searchParams

  const [profile, defaultProjectId, projects, generations, preset] = await Promise.all([
    getMyProfile(),
    ensureDefaultProject(),
    listMyProjects(),
    listMyGenerations({ limit: 24 }),
    presetSlug ? getPresetBySlug(presetSlug) : Promise.resolve(null),
  ])

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the shot, pick a model, and watch it render.
        </p>
      </div>

      {!isServiceRoleConfigured && <ServiceRoleWarning />}

      <GenerationFeedProvider userId={user.id} initialGenerations={generations}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-6">
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
            />
          </div>

          <JobFeed />
        </div>
      </GenerationFeedProvider>
    </div>
  )
}

function NotSignedIn() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Sign in to create</h1>
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
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
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
