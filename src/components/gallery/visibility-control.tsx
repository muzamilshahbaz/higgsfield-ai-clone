'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Globe2, Loader2, Lock } from 'lucide-react'

import { setCategoriesAction, setVisibilityAction } from '@/app/explore/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CATEGORY_TAGS,
  MAX_CATEGORIES,
  TAG_LABELS,
  suggestCategories,
} from '@/lib/categories'
import { cn } from '@/lib/utils'
import type {
  ExploreCategorySlug,
  GenerationVisibility,
  GenerationWithAssets,
} from '@/types/database'

/**
 * Publishing, unpublishing and tagging — the owner's side of Explore.
 *
 * One component for the whole flow, used by the library card and by the detail
 * drawer, because the two were never going to keep the same rules otherwise:
 * publishing asks for categories, unpublishing asks for nothing, and only a
 * finished shot can be published at all.
 *
 * The asymmetry is deliberate. Going public is a decision with a dialog
 * attached — it puts work in front of strangers, and that is the moment to ask
 * what it is. Going private is a retreat, and a retreat should never be behind
 * a confirmation: the person clicking it has already decided.
 */

export function VisibilityControl({
  generation,
  onChanged,
  variant = 'chip',
  className,
}: {
  generation: Pick<
    GenerationWithAssets,
    'id' | 'status' | 'visibility' | 'prompt' | 'categories'
  >
  onChanged: (
    id: string,
    visibility: GenerationVisibility,
    categories: ExploreCategorySlug[],
  ) => void
  /** `chip` sits on a library tile; `button` sits in the drawer's panel. */
  variant?: 'chip' | 'button'
  className?: string
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const isPublic = generation.visibility === 'public'
  // The check constraint refuses a public row that is not `succeeded`, so the
  // control says why rather than letting the database answer.
  const publishable = generation.status === 'succeeded'

  async function unpublish() {
    setBusy(true)
    const result = await setVisibilityAction(generation.id, 'private')
    setBusy(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    onChanged(generation.id, 'private', generation.categories ?? [])
    toast.success('Taken down from Explore', {
      description: 'Only you can see it again. Its likes and comments are kept.',
    })
  }

  function activate() {
    if (isPublic) void unpublish()
    else setDialogOpen(true)
  }

  const label = isPublic ? 'Public' : 'Private'
  const Icon = isPublic ? Globe2 : Lock

  return (
    <>
      {variant === 'chip' ? (
        <button
          type="button"
          onClick={activate}
          disabled={busy || !publishable}
          aria-label={
            !publishable
              ? 'Only a finished shot can be published'
              : isPublic
                ? 'Public — make this private'
                : 'Private — publish this to Explore'
          }
          title={
            !publishable
              ? 'Only a finished shot can be published'
              : isPublic
                ? 'Public. Click to make it private.'
                : 'Private. Click to publish it.'
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-5 backdrop-blur-sm transition-colors',
            // A near-opaque plate rather than a 15% tint: these sit on top of a
            // photograph, and cyan at 15% over a bright sky is cyan on white.
            'bg-background/85',
            isPublic
              ? 'border-primary/40 text-brand hover:border-primary/70'
              : 'border-border text-muted-foreground hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          {busy ? (
            <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Icon className="size-3 shrink-0" aria-hidden />
          )}
          {label}
        </button>
      ) : (
        <Button
          variant={isPublic ? 'outline' : 'default'}
          size="sm"
          onClick={activate}
          disabled={busy || !publishable}
          className={className}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isPublic ? (
            <Lock className="size-3.5" />
          ) : (
            <Globe2 className="size-3.5" />
          )}
          {isPublic ? 'Unpublish' : 'Publish'}
        </Button>
      )}

      <PublishDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        generation={generation}
        onPublished={(categories) => {
          onChanged(generation.id, 'public', categories)
          setDialogOpen(false)
        }}
      />
    </>
  )
}

/**
 * The publish sheet: pick what it is, then put it up.
 *
 * Categories are pre-ticked from the prompt's own words, never written without
 * being shown — the point is to save typing for someone who agrees, not to tag
 * the feed automatically and be wrong in public. Publishing with nothing ticked
 * is allowed and says what it costs.
 */
export function PublishDialog({
  open,
  onOpenChange,
  generation,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  generation: Pick<GenerationWithAssets, 'id' | 'prompt' | 'categories' | 'visibility'>
  onPublished: (categories: ExploreCategorySlug[]) => void
}) {
  const [selected, setSelected] = React.useState<ExploreCategorySlug[]>([])
  const [busy, setBusy] = React.useState(false)

  const alreadyPublic = generation.visibility === 'public'

  // Seeded when the dialog opens rather than on every render, so a suggestion
  // the user has just unticked does not reappear underneath them.
  React.useEffect(() => {
    if (!open) return

    const existing = generation.categories ?? []
    setSelected(existing.length > 0 ? existing : suggestCategories(generation.prompt))
  }, [open, generation.categories, generation.prompt])

  const atLimit = selected.length >= MAX_CATEGORIES

  function toggle(slug: ExploreCategorySlug) {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((entry) => entry !== slug)
        : current.length >= MAX_CATEGORIES
          ? current
          : [...current, slug],
    )
  }

  async function submit() {
    setBusy(true)

    // Already public: this is a retag, and going through the publish action
    // would re-run a visibility write that changes nothing.
    const result = alreadyPublic
      ? await setCategoriesAction(generation.id, selected)
      : await setVisibilityAction(generation.id, 'public', selected)

    setBusy(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    onPublished(result.data.categories)

    toast.success(alreadyPublic ? 'Categories updated' : 'Published to Explore', {
      description: alreadyPublic
        ? 'It will show under those categories from now on.'
        : selected.length > 0
          ? `Anyone can find it under ${selected.map((slug) => TAG_LABELS[slug]).join(', ')}.`
          : 'Anyone with the link can see it now.',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{alreadyPublic ? 'Edit categories' : 'Publish to Explore'}</DialogTitle>
          <DialogDescription>
            {alreadyPublic
              ? 'Categories decide where this shot turns up when people browse.'
              : 'It joins the public feed and gets a link you can share. You can make it private again at any time.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <h3 className="eyebrow text-muted-foreground/70">
              Categories
              <span className="ml-2 font-sans text-[11px] normal-case tracking-normal">
                {selected.length} of {MAX_CATEGORIES}
              </span>
            </h3>

            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Pick up to {MAX_CATEGORIES}. We have guessed from your prompt — change anything that
              is wrong.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORY_TAGS.map((slug) => {
                const on = selected.includes(slug)
                const blocked = !on && atLimit

                return (
                  <button
                    key={slug}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={blocked}
                    onClick={() => toggle(slug)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      on
                        ? 'border-primary/50 bg-primary/15 text-brand'
                        : 'border-border bg-surface/40 text-muted-foreground hover:border-muted hover:text-foreground',
                      blocked && 'cursor-not-allowed opacity-40 hover:border-border',
                    )}
                  >
                    {TAG_LABELS[slug]}
                  </button>
                )
              })}
            </div>
          </div>

          {selected.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-surface/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              With no categories it still appears in Explore under Everything, Trending and its
              media type — people just will not find it by browsing a category.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
            {alreadyPublic ? 'Save categories' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
