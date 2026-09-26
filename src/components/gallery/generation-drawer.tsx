'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  Download,
  FolderOpen,
  Globe,
  ImageIcon,
  Lock,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'

import { deleteGenerationAction, moveGenerationAction } from '@/app/(studio)/library/actions'
import { setVisibilityAction } from '@/app/(studio)/explore/actions'
import { ShareButton } from '@/components/explore/share-button'
import { setProjectCoverAction } from '@/app/(studio)/projects/actions'
import { GenerationMedia } from '@/components/gallery/generation-media'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePresetCatalogue } from '@/hooks/use-preset-catalogue'
import { getModel } from '@/lib/ai/registry'
import { STATUS_LABELS, TASK_LABELS } from '@/lib/constants'
import { downloadMedia, filenameFor } from '@/lib/download'
import { isRecord } from '@/lib/presets'
import {
  aspectStyle,
  cn,
  formatBytes,
  formatDuration,
  formatRelativeTime,
} from '@/lib/utils'
import type { GenerationVisibility, GenerationWithAssets } from '@/types/database'

/**
 * The detail view behind every library tile.
 *
 * One component serves the library, a project's grid and the history table, so
 * "delete" means the same thing everywhere and the reproduction details —
 * resolved prompt, seed, merged params — are always the ones that were
 * actually sent to the provider, read off the row rather than recomputed.
 */

export interface DrawerProject {
  id: string
  title: string
  isDefault: boolean
}

/** No project: PostgREST needs a sentinel, since a Select cannot hold null. */
const UNFILED = '__unfiled__'

export function GenerationDrawer({
  generation,
  open,
  onOpenChange,
  projects,
  coverProjectId = null,
  onDeleted,
  onMoved,
  onVisibilityChanged,
}: {
  generation: GenerationWithAssets | null
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: DrawerProject[]
  /** Set when the drawer is opened from inside a project, enabling "set cover". */
  coverProjectId?: string | null
  onDeleted?: (id: string) => void
  onMoved?: (id: string, projectId: string | null) => void
  onVisibilityChanged?: (id: string, visibility: GenerationVisibility) => void
}) {
  const { byId } = usePresetCatalogue()
  const [busy, setBusy] = React.useState<
    null | 'download' | 'move' | 'cover' | 'delete' | 'publish'
  >(null)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  // Reset the destructive confirmation whenever a different shot is opened.
  React.useEffect(() => {
    setConfirmingDelete(false)
  }, [generation?.id])

  if (!generation) return null

  const model = getModel(generation.model_id)
  const preset = generation.preset_id ? byId.get(generation.preset_id) : undefined
  const media = generation.assets.find((asset) => asset.kind !== 'poster') ?? generation.assets[0]
  const failed = generation.status === 'failed' || generation.status === 'canceled'
  const label = generation.prompt.trim() || 'Preset-only shot'
  const params = isRecord(generation.params) ? Object.entries(generation.params) : []
  const isPublic = generation.visibility === 'public'

  async function download() {
    if (!media || !generation) return
    setBusy('download')
    try {
      const saved = await downloadMedia(media.url, filenameFor(media.url, label))
      if (saved) toast.success('Saved to your downloads')
      else toast.message('Opened in a new tab', { description: 'Your browser blocked the download.' })
    } finally {
      setBusy(null)
    }
  }

  async function move(value: string) {
    if (!generation) return
    const projectId = value === UNFILED ? null : value
    if (projectId === generation.project_id) return

    setBusy('move')
    const result = await moveGenerationAction(generation.id, projectId)
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onMoved?.(generation.id, result.data.projectId)
    const destination = projects.find((project) => project.id === projectId)
    toast.success(destination ? `Moved to ${destination.title}` : 'Removed from its project')
  }

  async function makeCover() {
    if (!generation || !coverProjectId) return
    setBusy('cover')
    const result = await setProjectCoverAction(coverProjectId, generation.id)
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Project cover updated')
  }

  async function setVisibility(next: 'public' | 'private') {
    if (!generation) return
    setBusy('publish')
    const result = await setVisibilityAction(generation.id, next)
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    onVisibilityChanged?.(generation.id, result.data.visibility)
    toast.success(next === 'public' ? 'Published to Explore' : 'Taken down from Explore', {
      description:
        next === 'public' ? 'Anyone with the link can see it now.' : 'Only you can see it again.',
    })
  }

  async function remove() {
    if (!generation) return
    setBusy('delete')
    const result = await deleteGenerationAction(generation.id, generation.project_id)
    setBusy(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onDeleted?.(generation.id)
    onOpenChange(false)
    toast.success('Deleted', {
      description:
        result.data.assetsRemoved > 0
          ? `${result.data.assetsRemoved} file${result.data.assetsRemoved === 1 ? '' : 's'} removed from storage.`
          : 'The job is gone from your library.',
    })
  }

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Status', value: STATUS_LABELS[generation.status] },
    { label: 'Type', value: TASK_LABELS[generation.task] },
    { label: 'Model', value: model?.label ?? generation.model_id },
    { label: 'Provider', value: generation.provider },
    { label: 'Aspect ratio', value: generation.aspect_ratio },
    ...(generation.duration_sec
      ? [{ label: 'Duration', value: `${generation.duration_sec}s` }]
      : []),
    { label: 'Seed', value: generation.seed ?? 'Random' },
    { label: 'Credits', value: `${generation.credit_cost}${failed ? ' · refunded' : ''}` },
    { label: 'Created', value: formatRelativeTime(generation.created_at) },
    ...(media?.width && media.height
      ? [{ label: 'Size', value: `${media.width}×${media.height}` }]
      : []),
    ...(media?.duration_ms ? [{ label: 'Length', value: formatDuration(media.duration_ms) }] : []),
    ...(media?.size_bytes ? [{ label: 'File', value: formatBytes(media.size_bytes) }] : []),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate">{label}</DialogTitle>
          <DialogDescription>
            {preset ? `${preset.title} · ` : ''}
            {model?.label ?? generation.model_id} · {formatRelativeTime(generation.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:overflow-hidden">
          <div className="flex items-center justify-center bg-surface/60 p-4 md:overflow-y-auto">
            {media ? (
              <div
                className="w-full max-w-lg overflow-hidden rounded-lg bg-background"
                style={aspectStyle(generation.aspect_ratio)}
              >
                <GenerationMedia assets={generation.assets} alt={label} />
              </div>
            ) : (
              <NoMedia generation={generation} />
            )}
          </div>

          <div className="space-y-5 p-5 md:overflow-y-auto">
            {failed && generation.error_message && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium">This job failed</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {generation.error_message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your {generation.credit_cost}{' '}
                    {generation.credit_cost === 1 ? 'credit was' : 'credits were'} returned.
                  </p>
                </div>
              </div>
            )}

            {preset && (
              <Badge variant="outline" className="max-w-full">
                <Wand2 className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{preset.title}</span>
              </Badge>
            )}

            <Section title="Prompt">
              <p className="text-sm leading-relaxed text-foreground/90">
                {generation.prompt.trim() || (
                  <span className="text-muted-foreground">No prompt — the preset carried it.</span>
                )}
              </p>
            </Section>

            {generation.resolved_prompt &&
              generation.resolved_prompt !== generation.prompt.trim() && (
                <Section title={`Sent to ${model?.label ?? generation.model_id}`}>
                  <p className="rounded-lg border border-border/60 bg-surface/50 p-2.5 text-xs leading-relaxed text-foreground/80">
                    {generation.resolved_prompt}
                  </p>
                </Section>
              )}

            {generation.negative_prompt && (
              <Section title="Negative prompt">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {generation.negative_prompt}
                </p>
              </Section>
            )}

            <Section title="Details">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="eyebrow text-muted-foreground">
                      {fact.label}
                    </dt>
                    <dd className="mt-0.5 truncate text-xs tabular-nums text-foreground/85">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            {params.length > 0 && (
              <Section title="Parameters">
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-surface/50 p-2.5 text-xs">
                  {params.map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt className="truncate font-mono text-muted-foreground">{key}</dt>
                      <dd className="tabular-nums text-foreground/80">{String(value)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </Section>
            )}

            {generation.status === 'succeeded' && (
              <Section title="Visibility">
                <div className="space-y-2.5 rounded-lg border border-border/60 bg-surface/50 p-3">
                  <div className="flex items-start gap-2.5">
                    {isPublic ? (
                      <Globe className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {isPublic ? 'Published to Explore' : 'Private to you'}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {isPublic
                          ? 'It appears in the public feed, and anyone with the link can open it.'
                          : 'Publishing adds it to Explore and gives it a link you can share.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={isPublic ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => void setVisibility(isPublic ? 'private' : 'public')}
                      disabled={busy === 'publish'}
                    >
                      {busy === 'publish' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : isPublic ? (
                        <Lock className="size-3.5" />
                      ) : (
                        <Globe className="size-3.5" />
                      )}
                      {isPublic ? 'Unpublish' : 'Publish'}
                    </Button>

                    {isPublic && (
                      <>
                        <ShareButton generationId={generation.id} variant="ghost" />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {generation.like_count} {generation.like_count === 1 ? 'like' : 'likes'}
                          {generation.remix_count > 0
                            ? ` · ${generation.remix_count} ${generation.remix_count === 1 ? 'remix' : 'remixes'}`
                            : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {projects.length > 0 && (
              <Section title="Project">
                <Select
                  value={generation.project_id ?? UNFILED}
                  onValueChange={(value) => void move(value)}
                  disabled={busy === 'move'}
                >
                  <SelectTrigger aria-label="Move to a project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNFILED}>No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Section>
            )}
          </div>
        </div>

        <DialogFooter>
          {media && (
            <Button variant="outline" onClick={() => void download()} disabled={busy === 'download'}>
              {busy === 'download' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download
            </Button>
          )}

          {media && generation.status === 'succeeded' && (
            <Button asChild variant="outline">
              <Link href={`/create?image=${encodeURIComponent(media.url)}`}>
                <Sparkles className="size-4" />
                Use as start frame
              </Link>
            </Button>
          )}

          {coverProjectId && media && generation.status === 'succeeded' && (
            <Button variant="outline" onClick={() => void makeCover()} disabled={busy === 'cover'}>
              {busy === 'cover' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              Set as cover
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {confirmingDelete ? (
              <>
                <span className="text-xs text-muted-foreground">Delete for good?</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void remove()}
                  disabled={busy === 'delete'}
                >
                  {busy === 'delete' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Delete
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                className="text-danger hover:text-danger"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="eyebrow text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A job with no output: the start frame if there was one, else the reason. */
function NoMedia({ generation }: { generation: GenerationWithAssets }) {
  if (generation.input_image_url) {
    return (
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg bg-background"
        style={aspectStyle(generation.aspect_ratio)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={generation.input_image_url}
          alt="The start frame this job was given"
          className={cn('size-full object-cover', generation.status !== 'succeeded' && 'opacity-50')}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        {generation.status === 'succeeded'
          ? 'This job finished, but its media is no longer stored.'
          : 'No media yet.'}
      </p>
    </div>
  )
}
