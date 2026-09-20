import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Coins, Sparkles, Wand2 } from 'lucide-react'

import { PermalinkActions } from '@/components/explore/permalink-actions'
import { GenerationMedia } from '@/components/gallery/generation-media'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getModel } from '@/lib/ai/registry'
import { TASK_LABELS } from '@/lib/constants'
import { authorInitialsOf, authorNameOf } from '@/lib/explore'
import { getCurrentUser } from '@/lib/supabase/server'
import { aspectStyle, formatRelativeTime, truncate } from '@/lib/utils'
import { getPublicGeneration, listPublicGenerations } from '@/services/explore.service'
import { getPreset } from '@/services/preset.service'
import { PermalinkStrip } from '@/components/explore/permalink-strip'

/**
 * The public permalink.
 *
 * Outside the studio group and outside `middleware.ts`'s protected prefixes,
 * so a link shared with someone who has never heard of the product opens for
 * them. It wears the marketing chrome rather than the studio sidebar for the
 * same reason — the page's job is to show the work and offer a way in.
 *
 * Deliberately no `loading.tsx` beside this file. A Suspense boundary lets
 * Next flush the shell — and with it a 200 — before this component decides to
 * call `notFound()`, which turns every dead permalink into a soft 404 that
 * crawlers and link checkers read as a live page. The page is one indexed
 * query, so there is nothing worth streaming around; adding a skeleton here
 * would trade a correct status code for a skeleton nobody sees.
 */

const RELATED_COUNT = 6

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const generation = await getPublicGeneration(id)

  if (!generation) {
    return { title: 'Shot not found', robots: { index: false } }
  }

  const title = truncate(generation.prompt.trim() || 'A shot made with Kinetic', 70)
  const author = authorNameOf(generation)
  const description = `${TASK_LABELS[generation.task]} by ${author}, made with Kinetic.`

  // Only an image unfurls reliably across link previews; a video asset would
  // render as a broken card on most of them, so the poster is preferred and a
  // clip with no poster simply falls back to the site's own card.
  const poster = generation.assets.find((asset) => asset.kind === 'poster')
  const image = generation.assets.find((asset) => asset.kind === 'image')
  const preview = poster?.url ?? image?.url

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      images: preview ? [{ url: preview }] : undefined,
    },
    twitter: {
      card: preview ? 'summary_large_image' : 'summary',
      title,
      description,
      images: preview ? [preview] : undefined,
    },
  }
}

export default async function PermalinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [generation, user] = await Promise.all([getPublicGeneration(id), getCurrentUser()])

  // Covers a bad id, a private shot and a deleted one with the same answer,
  // which is the only answer a stranger is entitled to.
  if (!generation) notFound()

  const [preset, related] = await Promise.all([
    generation.preset_id ? getPreset(generation.preset_id) : Promise.resolve(null),
    listPublicGenerations({ limit: RELATED_COUNT, excludeId: generation.id }),
  ])

  const model = getModel(generation.model_id)
  const label = generation.prompt.trim()
  const author = authorNameOf(generation)

  return (
    <div className="relative min-h-dvh">
      <SiteHeader isSignedIn={Boolean(user)} />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div
            className="relative w-full overflow-hidden bg-surface"
            style={aspectStyle(generation.aspect_ratio)}
          >
            <GenerationMedia
              assets={generation.assets}
              alt={label || `A ${TASK_LABELS[generation.task].toLowerCase()} made with Kinetic`}
            />
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar className="size-8">
                {generation.author_avatar_url && (
                  <AvatarImage src={generation.author_avatar_url} alt="" />
                )}
                <AvatarFallback className="text-xs">
                  {authorInitialsOf(generation)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{author}</p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(generation.created_at)}
                </p>
              </div>
            </div>

            {/*
              The prompt is what this page is about — it is what the <title>
              and the OG tags say, so it is the h1 as well. A shared permalink
              is a public landing surface; one with no h1 reads as headingless
              to a screen reader and to a crawler.
            */}
            <h1 className="text-pretty text-lg font-normal leading-relaxed text-foreground/90">
              {label || 'Untitled shot'}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              {preset && (
                <Badge variant="outline">
                  <Wand2 className="size-3 shrink-0" aria-hidden />
                  {preset.title}
                </Badge>
              )}
              <Badge variant="secondary">{model?.label ?? generation.model_id}</Badge>
              <Badge variant="secondary">{generation.aspect_ratio}</Badge>
              {generation.duration_sec ? (
                <Badge variant="secondary">{generation.duration_sec}s</Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                <Coins className="size-3" aria-hidden />
                {generation.credit_cost} {generation.credit_cost === 1 ? 'credit' : 'credits'}
              </span>
            </div>

            <PermalinkActions
              generationId={generation.id}
              initialLiked={generation.liked}
              initialCount={generation.like_count}
              signedIn={Boolean(user)}
            />
          </div>
        </div>

        {!user && (
          <div className="mt-10 rounded-2xl border border-border bg-surface/50 p-6 text-center">
            <h2 className="text-lg font-semibold tracking-tight">Make one of your own</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              Kinetic gives every new account 200 credits — enough for your first few shots, no
              card required.
            </p>
            <Button asChild className="mt-5">
              <Link href="/sign-up">
                <Sparkles className="size-4" />
                Start creating free
              </Link>
            </Button>
          </div>
        )}

        <PermalinkStrip items={related} signedIn={Boolean(user)} />
      </main>

      <SiteFooter />
    </div>
  )
}
