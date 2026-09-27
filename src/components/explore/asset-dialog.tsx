'use client'

import * as React from 'react'
import Link from 'next/link'
import { Coins, ExternalLink, Repeat2, Server, Wand2 } from 'lucide-react'

import { CommentThread } from '@/components/explore/comment-thread'
import { DownloadButton } from '@/components/explore/download-button'
import {
  CategoryChips,
  FavouriteButton,
  VisibilityBadge,
} from '@/components/explore/engagement'
import { LikeButton } from '@/components/explore/like-button'
import { ShareButton } from '@/components/explore/share-button'
import { GenerationMedia } from '@/components/gallery/generation-media'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getModel } from '@/lib/ai/registry'
import { TASK_LABELS } from '@/lib/constants'
import {
  authorInitialsOf,
  authorNameOf,
  displayTitleOf,
  type ExploreItem,
} from '@/lib/explore'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'
import { aspectStyle, cn, truncate } from '@/lib/utils'

/**
 * A published shot, in full.
 *
 * A dialog rather than a route because it is opened from a grid the reader is
 * part-way down, and a navigation there costs them their place for something
 * they may close in two seconds. The permalink at `/g/[id]` renders the same
 * facts as a real page for everything a modal cannot be — a shared link, a
 * crawler, an unfurl — and Share copies that, not this.
 *
 * Related shots are fetched when the dialog opens rather than passed in: the
 * feed would otherwise have to carry six extra rows for every card it draws,
 * on the chance that one of them is opened.
 */
export function AssetDialog({
  item,
  open,
  onOpenChange,
  signedIn,
  onLike,
  onFavourite,
  onDownloadCounted,
  onCommentCountChange,
  onSelectRelated,
}: {
  item: ExploreItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  signedIn: boolean
  onLike: (item: ExploreItem) => void
  onFavourite: (item: ExploreItem) => void
  onDownloadCounted: (item: ExploreItem, count: number) => void
  onCommentCountChange: (item: ExploreItem, delta: number) => void
  /** Opens one of the related shots in place of this one. */
  onSelectRelated?: (related: ExploreItem) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        {item ? (
          <AssetDialogBody
            item={item}
            signedIn={signedIn}
            onLike={onLike}
            onFavourite={onFavourite}
            onDownloadCounted={onDownloadCounted}
            onCommentCountChange={onCommentCountChange}
            onSelectRelated={onSelectRelated}
          />
        ) : (
          // Radix requires a title for the labelling contract even in the
          // frame between opening and having something to show.
          <DialogHeader>
            <DialogTitle className="sr-only">Loading shot</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AssetDialogBody({
  item,
  signedIn,
  onLike,
  onFavourite,
  onDownloadCounted,
  onCommentCountChange,
  onSelectRelated,
}: {
  item: ExploreItem
  signedIn: boolean
  onLike: (item: ExploreItem) => void
  onFavourite: (item: ExploreItem) => void
  onDownloadCounted: (item: ExploreItem, count: number) => void
  onCommentCountChange: (item: ExploreItem, delta: number) => void
  onSelectRelated?: (related: ExploreItem) => void
}) {
  const { byId } = usePresetCatalogue()

  const [related, setRelated] = React.useState<ExploreItem[]>([])
  const [loadingRelated, setLoadingRelated] = React.useState(true)

  const preset = item.preset_id ? byId.get(item.preset_id) : undefined
  const model = getModel(item.model_id)
  const label = displayTitleOf(item)
  const author = authorNameOf(item)

  /**
   * More like this.
   *
   * Asks the feed for the shot's strongest category and drops the shot itself
   * client-side; a dedicated endpoint would be the same query with one more
   * route to authorise. An empty result simply hides the strip.
   */
  React.useEffect(() => {
    let cancelled = false
    setLoadingRelated(true)

    const params = new URLSearchParams({ limit: '8' })
    if (item.categories.length > 0) params.set('category', item.categories[0]!)

    void fetch(`/api/explore?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : { generations: [] }))
      .then((data: { generations?: ExploreItem[] }) => {
        if (cancelled) return
        setRelated((data.generations ?? []).filter((row) => row.id !== item.id).slice(0, 6))
      })
      .catch(() => {
        if (!cancelled) setRelated([])
      })
      .finally(() => {
        if (!cancelled) setLoadingRelated(false)
      })

    return () => {
      cancelled = true
    }
  }, [item.id, item.categories])

  return (
    <>
      <DialogHeader>
        <DialogTitle className="line-clamp-2 pr-2">{truncate(label, 120)}</DialogTitle>
      </DialogHeader>

      {/* The dialog's own scroll region. The header and its close button stay
          pinned while a long comment thread moves underneath. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* ------------------------------------------------- the media */}
          <div className="space-y-4">
            <div
              className="relative w-full overflow-hidden rounded-xl border border-border bg-surface"
              style={aspectStyle(item.aspect_ratio)}
            >
              <GenerationMedia assets={item.assets} alt={label} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LikeButton
                liked={item.liked}
                count={item.like_count}
                signedIn={signedIn}
                onToggle={() => onLike(item)}
                size="lg"
                returnTo={`/g/${item.id}`}
              />

              <FavouriteButton
                favourited={item.favourited}
                count={item.favourite_count}
                signedIn={signedIn}
                onToggle={() => onFavourite(item)}
                size="lg"
                returnTo={`/g/${item.id}`}
              />

              <DownloadButton
                generationId={item.id}
                assets={item.assets}
                label={label}
                count={item.download_count}
                onCounted={(next) => onDownloadCounted(item, next)}
                variant="button"
              />

              <ShareButton generationId={item.id} title={label} />

              <Button asChild className="ml-auto">
                <Link href={`/create?remix=${item.id}`}>
                  <Repeat2 className="size-4" />
                  Remix
                </Link>
              </Button>
            </div>
          </div>

          {/* --------------------------------------------- the facts */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar className="size-9">
                {item.author_avatar_url && <AvatarImage src={item.author_avatar_url} alt="" />}
                <AvatarFallback className="text-xs">{authorInitialsOf(item)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{author}</p>
                <p className="text-xs text-muted-foreground">
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                </p>
              </div>

              {item.isOwner && <VisibilityBadge visibility={item.visibility} />}
            </div>

            {item.prompt.trim() && (
              <Field label="Prompt">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                  {item.prompt.trim()}
                </p>
              </Field>
            )}

            {item.negative_prompt?.trim() && (
              <Field label="Negative prompt">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                  {item.negative_prompt.trim()}
                </p>
              </Field>
            )}

            {item.categories.length > 0 && (
              <Field label="Categories">
                <CategoryChips categories={item.categories} />
              </Field>
            )}

            <Field label="How it was made">
              <div className="flex flex-wrap items-center gap-2">
                {preset && (
                  <Badge variant="outline">
                    <Wand2 className="size-3 shrink-0" aria-hidden />
                    {preset.title}
                  </Badge>
                )}
                <Badge variant="secondary">{model?.label ?? item.model_id}</Badge>
                <Badge variant="outline">
                  <Server className="size-3 shrink-0" aria-hidden />
                  {/* The provider, named plainly. A feed that hides which
                      vendor rendered something is hiding the one fact a
                      creator comparing models actually wants. */}
                  {providerLabel(item.provider)}
                </Badge>
                <Badge variant="secondary">{TASK_LABELS[item.task]}</Badge>
                <Badge variant="secondary">{item.aspect_ratio}</Badge>
                {item.duration_sec ? (
                  <Badge variant="secondary">{item.duration_sec}s</Badge>
                ) : null}
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <Coins className="size-3" aria-hidden />
                  {item.credit_cost} {item.credit_cost === 1 ? 'credit' : 'credits'}
                </span>
              </div>
            </Field>

            <Link
              href={`/g/${item.id}`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden />
              Open the permalink
            </Link>
          </div>
        </div>

        {/* ------------------------------------------------- comments */}
        <div className="border-t border-border/60 px-5 py-6">
          <CommentThread
            key={item.id}
            generationId={item.id}
            signedIn={signedIn}
            returnTo={`/g/${item.id}`}
            onCountChange={(delta) => onCommentCountChange(item, delta)}
          />
        </div>

        {/* -------------------------------------------------- related */}
        {(loadingRelated || related.length > 0) && (
          <div className="border-t border-border/60 px-5 py-6">
            <h3 className="font-display text-sm font-medium">More like this</h3>

            <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {loadingRelated
                ? Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className="shimmer aspect-square rounded-lg bg-surface-2"
                      style={{ animationDelay: `${index * 80}ms` }}
                    />
                  ))
                : related.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onSelectRelated?.(row)}
                      aria-label={`Open ${truncate(displayTitleOf(row), 60)}`}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-lg border border-border bg-surface',
                        'transition-colors hover:border-muted',
                      )}
                    >
                      <GenerationMedia
                        assets={row.assets}
                        alt={displayTitleOf(row)}
                        autoPlay={false}
                      />
                    </button>
                  ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="eyebrow text-muted-foreground/70">{label}</h3>
      {children}
    </div>
  )
}

/** Vendor names as their owners write them, not as the enum spells them. */
function providerLabel(provider: string): string {
  const names: Record<string, string> = {
    mock: 'Mock',
    huggingface: 'Hugging Face',
    fal: 'fal.ai',
    replicate: 'Replicate',
    flux: 'Black Forest Labs',
    stability: 'Stability AI',
    openai: 'OpenAI',
    google: 'Google',
    kling: 'Kling',
    runway: 'Runway',
    luma: 'Luma',
    pika: 'Pika',
  }
  return names[provider] ?? provider
}
