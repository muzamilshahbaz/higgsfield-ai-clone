'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Loader2, Repeat2, Sparkles } from 'lucide-react'

import { ImageDrop } from '@/components/composer/image-drop'
import { ModelSelector } from '@/components/composer/model-selector'
import { PresetPicker } from '@/components/composer/preset-picker'
import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useGenerationFeed } from '@/hooks/use-generation-feed'
import { creditCostFor, defaultModelForTask, getModel, type ModelEntry } from '@/lib/ai/registry'
import { ASPECT_RATIOS, LIMITS, TASK_LABELS, VIDEO_DURATIONS } from '@/lib/constants'
import { resolveCreditCost, type PresetSummary } from '@/lib/presets'
import type { RemixDraft } from '@/lib/remix'
import { cn, newIdempotencyKey } from '@/lib/utils'
import { createGenerationSchema, fieldErrors } from '@/lib/validation/generation'
import type { GenerationTask, GenerationWithAssets } from '@/types/database'

/**
 * The composer.
 *
 * Every constraint it enforces — which aspect ratios, which durations, whether
 * a start frame is needed, what it costs — is read from the model registry and
 * the shared zod schema, which is the same schema the route handler runs. The
 * button therefore disables for exactly the reasons the server would reject.
 *
 * Presets follow the same rule: the quoted price comes from `lib/presets.ts`,
 * the module the server uses to write the row, so what is shown here is what
 * gets charged.
 */

const TASKS: GenerationTask[] = ['text_to_image', 'text_to_video', 'image_to_video']

interface ComposerState {
  task: GenerationTask
  modelId: string
  preset: PresetSummary | null
  prompt: string
  negativePrompt: string
  imageUrl: string | null
  aspectRatio: string
  durationSec: number | null
  seed: string
}

function initialStateFor(task: GenerationTask): ComposerState {
  const model = defaultModelForTask(task)
  return {
    task,
    modelId: model.id,
    preset: null,
    prompt: '',
    negativePrompt: '',
    imageUrl: null,
    aspectRatio: model.supports.aspectRatios[0] ?? '16:9',
    durationSec: model.supports.durations?.[0] ?? null,
    seed: '',
  }
}

/**
 * Coerces the form to a model: the task it serves, and every field it can
 * actually accept. Anything the model cannot take is dropped here rather than
 * sent and rejected.
 */
function withModel(current: ComposerState, model: ModelEntry): ComposerState {
  const durations = model.supports.durations

  return {
    ...current,
    task: model.task,
    modelId: model.id,
    aspectRatio: model.supports.aspectRatios.includes(current.aspectRatio)
      ? current.aspectRatio
      : (model.supports.aspectRatios[0] ?? '16:9'),
    durationSec:
      durations && durations.length > 0
        ? current.durationSec && durations.includes(current.durationSec)
          ? current.durationSec
          : durations[0]!
        : null,
    imageUrl: model.supports.imageInput ? current.imageUrl : null,
    negativePrompt: model.supports.negativePrompt ? current.negativePrompt : '',
  }
}

export interface ComposerProject {
  id: string
  title: string
  isDefault: boolean
}

export function Composer({
  credits,
  projectId,
  projects = [],
  initialPreset = null,
  initialImageUrl = null,
  initialRemix = null,
}: {
  credits: number
  /** Where a new generation is filed unless the user picks another project. */
  projectId?: string | null
  projects?: ComposerProject[]
  /** From `/create?preset=<slug>` — the gallery's "Use preset" link. */
  initialPreset?: PresetSummary | null
  /** From `/create?image=<url>` — the library's "Use as start frame". */
  initialImageUrl?: string | null
  /** From `/create?remix=<id>` — Explore's "Remix this". */
  initialRemix?: RemixDraft | null
}) {
  const router = useRouter()
  const { upsert } = useGenerationFeed()

  // Kept beside the form rather than inside it: a project is not a model
  // capability, so `withModel` has no business resetting it.
  const [targetProjectId, setTargetProjectId] = React.useState<string | null>(projectId ?? null)

  const [state, setState] = React.useState<ComposerState>(() => {
    // A remix carries the whole form, so it is resolved first and the preset
    // rides along with it — `buildRemixDraft` has already reconciled the model,
    // the aspect ratio and the duration with the registry.
    if (initialRemix) {
      const model = getModel(initialRemix.modelId) ?? defaultModelForTask(initialRemix.task)
      return {
        ...withModel(initialStateFor(model.task), model),
        preset: initialPreset,
        prompt: initialRemix.prompt,
        negativePrompt: initialRemix.negativePrompt,
        aspectRatio: initialRemix.aspectRatio,
        durationSec: initialRemix.durationSec,
        imageUrl: model.supports.imageInput ? initialRemix.imageUrl : null,
      }
    }

    const presetModel = initialPreset ? getModel(initialPreset.modelId) : undefined

    const base =
      initialPreset && presetModel
        ? { ...withModel(initialStateFor(presetModel.task), presetModel), preset: initialPreset }
        : initialStateFor('image_to_video')

    // `withModel` has already dropped the image if the chosen model cannot
    // take one, so this only ever sets a frame the model actually accepts.
    const model = getModel(base.modelId)
    if (initialImageUrl && model?.supports.imageInput) {
      return { ...base, imageUrl: initialImageUrl }
    }
    return base
  })

  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [advanced, setAdvanced] = React.useState(false)

  // Held across retries of the same click so a stutter in the network cannot
  // produce two jobs, and replaced only once a job actually exists.
  const idempotencyKeyRef = React.useRef(newIdempotencyKey())

  const model = getModel(state.modelId) ?? defaultModelForTask(state.task)
  const modelCost = creditCostFor(model, state.durationSec)
  const cost = resolveCreditCost(model, state.durationSec, state.preset)
  const affordable = credits >= cost

  const presetParams = Object.entries(state.preset?.params ?? {})

  /**
   * Moving to another task rebuilds every model-dependent field at once. A
   * preset survives only if the model it was authored for does that job — a
   * crash zoom cannot be applied by an image model.
   */
  const selectTask = (task: GenerationTask) => {
    setErrors({})
    setState((current) => {
      // The prompt is the one thing worth carrying across.
      const next = { ...initialStateFor(task), prompt: current.prompt }

      const presetModel = current.preset ? getModel(current.preset.modelId) : undefined
      if (current.preset && presetModel?.task === task) {
        return { ...withModel(next, presetModel), preset: current.preset }
      }
      return next
    })
  }

  const selectModel = (modelId: string) => {
    const nextModel = getModel(modelId)
    if (!nextModel) return

    setErrors({})
    setState((current) => withModel(current, nextModel))
  }

  /** A preset brings its own model, so choosing one can move the whole form. */
  const selectPreset = (preset: PresetSummary | null) => {
    setErrors({})

    if (!preset) {
      setState((current) => ({ ...current, preset: null }))
      return
    }

    const presetModel = getModel(preset.modelId)
    if (!presetModel) {
      // Catalogue and registry have drifted — seeded against a model that has
      // since been removed. Say so rather than ignoring the click.
      toast.error(`${preset.title} needs a model that is no longer available.`)
      return
    }

    setState((current) => ({ ...withModel(current, presetModel), preset }))
  }

  const aspectOptions: SegmentedOption<string>[] = ASPECT_RATIOS.filter((aspect) =>
    model.supports.aspectRatios.includes(aspect.value),
  ).map((aspect) => ({ value: aspect.value, label: aspect.label, hint: aspect.hint }))

  const durationOptions: SegmentedOption<number>[] = VIDEO_DURATIONS.filter((duration) =>
    model.supports.durations?.includes(duration.value),
  ).map((duration) => ({ value: duration.value, label: duration.label }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    const payload = {
      idempotencyKey: idempotencyKeyRef.current,
      task: state.task,
      modelId: state.modelId,
      presetId: state.preset?.id ?? undefined,
      projectId: targetProjectId ?? undefined,
      parentId: initialRemix?.parentId ?? undefined,
      prompt: state.prompt,
      negativePrompt: state.negativePrompt.trim() || undefined,
      imageUrl: state.imageUrl ?? undefined,
      aspectRatio: state.aspectRatio,
      durationSec: state.durationSec ?? undefined,
      seed: state.seed.trim() ? Number(state.seed.trim()) : undefined,
    }

    const parsed = createGenerationSchema.safeParse(payload)
    if (!parsed.success) {
      const fields = fieldErrors(parsed.error)
      setErrors(fields)
      toast.error(Object.values(fields)[0] ?? 'Check the form and try again.')
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const response = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      const data = (await response.json()) as {
        generation?: GenerationWithAssets
        error?: { code: string; message: string; fields?: Record<string, string> }
      }

      if (!response.ok || !data.generation) {
        if (data.error?.fields) setErrors(data.error.fields)
        toast.error(data.error?.message ?? 'Could not start that generation.')
        return
      }

      upsert([data.generation])
      idempotencyKeyRef.current = newIdempotencyKey()

      // The debit already happened server-side, so the topbar pill and this
      // form's `credits` prop are both stale until the layout re-renders.
      // The feed refreshes again when the job settles, for the refund case.
      router.refresh()

      if (data.generation.status === 'failed') {
        toast.error(data.generation.error_message ?? 'The provider rejected that job.')
      } else {
        toast.success(`Queued · ${cost} ${cost === 1 ? 'credit' : 'credits'}`)
      }
    } catch {
      toast.error('Could not reach the server. Check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      /*
        A header strip, a scrolling body, and a pinned action bar.

        The height cap is load-bearing, not styling. /create makes this panel
        `position: sticky`, and a sticky element taller than its viewport slot
        never scrolls: everything past the fold — including Generate — becomes
        permanently unreachable once the results column is long enough to keep
        the page scrolling. Capping the panel and scrolling its body instead
        keeps the action bar on screen at every height. The cap is `lg:` only,
        because below that the panel is not sticky and a nested scroll area
        inside a page scroll is the worst of both.
      */
      className="panel flex max-h-none flex-col overflow-hidden rounded-2xl lg:max-h-[calc(100dvh-7rem)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-4 py-3">
        <p className="eyebrow text-muted-foreground">Composer</p>
        <span className="eyebrow truncate text-muted-foreground">{model.label}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
      {initialRemix && (
        // Lineage is invisible otherwise: the form just looks pre-filled, and
        // the user has no way to tell they are about to credit someone else's
        // shot as the parent of theirs.
        <div className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
          <Repeat2 className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 text-muted-foreground">
            Remixing an existing shot. Swap anything you like.
          </span>
          <Link
            href={`/g/${initialRemix.parentId}`}
            className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
          >
            View original
          </Link>
        </div>
      )}

      <div className="space-y-2">
        <FieldLabel>What to make</FieldLabel>
        <Segmented
          name="What to make"
          value={state.task}
          onChange={selectTask}
          options={TASKS.map((task) => ({ value: task, label: TASK_LABELS[task] }))}
        />
      </div>

      <PresetPicker
        task={state.task}
        value={state.preset}
        onChange={selectPreset}
        disabled={submitting}
      />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <FieldLabel htmlFor="prompt">Prompt</FieldLabel>
          <span
            className={cn(
              'text-xs tabular-nums text-muted-foreground',
              state.prompt.length > LIMITS.maxPromptLength && 'text-danger',
            )}
          >
            {state.prompt.length}/{LIMITS.maxPromptLength}
          </span>
        </div>

        <Textarea
          id="prompt"
          rows={5}
          className="text-[15px]"
          value={state.prompt}
          aria-invalid={Boolean(errors.prompt)}
          aria-describedby={state.preset ? 'resolved-prompt' : undefined}
          placeholder={
            state.preset
              ? 'Describe the subject. The preset supplies the look — or leave this empty.'
              : 'A lighthouse in a storm, waves breaking over the rocks, dusk, anamorphic'
          }
          onChange={(event) => setState((current) => ({ ...current, prompt: event.target.value }))}
        />
        {errors.prompt && <p className="text-xs text-danger">{errors.prompt}</p>}

        {/*
          The exact string the provider will receive, assembled the way
          resolvePrompt() assembles it — what you typed, then the preset's
          fragment, comma-joined. Shown rather than described so the preset
          stops being a black box.
        */}
        {state.preset && (
          <div
            id="resolved-prompt"
            className="rounded-lg border-l-2 border-primary/50 bg-surface-2/40 py-2.5 pl-3 pr-2.5"
          >
            <p className="eyebrow text-muted-foreground">Sent to {model.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              {state.prompt.trim() ? `${state.prompt.trim()}, ` : null}
              <span className="text-brand">{state.preset.promptFragment}</span>
            </p>
          </div>
        )}
      </div>

      {model.supports.imageInput && (
        <ImageDrop
          value={state.imageUrl}
          error={errors.imageUrl}
          disabled={submitting}
          onChange={(imageUrl) => {
            setErrors((current) => ({ ...current, imageUrl: '' }))
            setState((current) => ({ ...current, imageUrl }))
          }}
        />
      )}

      <ModelSelector task={state.task} value={state.modelId} onChange={selectModel} />
      {errors.modelId && <p className="text-xs text-danger">{errors.modelId}</p>}

      <div className="space-y-2">
        <FieldLabel>Aspect ratio</FieldLabel>
        <Segmented
          name="Aspect ratio"
          size="sm"
          value={state.aspectRatio}
          options={aspectOptions}
          onChange={(aspectRatio) => setState((current) => ({ ...current, aspectRatio }))}
        />
      </div>

      {durationOptions.length > 0 && (
        <div className="space-y-2">
          <FieldLabel>Duration</FieldLabel>
          <Segmented
            name="Duration"
            size="sm"
            value={state.durationSec ?? durationOptions[0]!.value}
            options={durationOptions}
            onChange={(durationSec) => setState((current) => ({ ...current, durationSec }))}
          />
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          className="flex w-full items-center justify-between rounded-lg py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={advanced}
          aria-controls="composer-advanced"
        >
          Advanced settings
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-200 ease-[var(--ease-out-quint)]',
              advanced && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        {advanced && (
          <div id="composer-advanced" className="space-y-4">
            {model.supports.negativePrompt && (
              <div className="space-y-2">
                <FieldLabel htmlFor="negative">Negative prompt</FieldLabel>
                <Textarea
                  id="negative"
                  rows={2}
                  value={state.negativePrompt}
                  placeholder={state.preset?.negativePrompt ?? 'blurry, warped faces, watermark'}
                  onChange={(event) =>
                    setState((current) => ({ ...current, negativePrompt: event.target.value }))
                  }
                />
                {state.preset?.negativePrompt && !state.negativePrompt.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Left empty, the preset&rsquo;s own negative prompt is used.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <FieldLabel htmlFor="seed">Seed</FieldLabel>
              <Input
                id="seed"
                inputMode="numeric"
                value={state.seed}
                placeholder="Leave empty for a random seed"
                aria-invalid={Boolean(errors.seed)}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    seed: event.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                  }))
                }
              />
              {errors.seed && <p className="text-xs text-danger">{errors.seed}</p>}
            </div>

            {presetParams.length > 0 && (
              <div className="space-y-2">
                <FieldLabel>Preset parameters</FieldLabel>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface-2/40 p-3 text-xs">
                  {presetParams.map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt className="truncate font-mono text-muted-foreground">{key}</dt>
                      <dd className="tabular-nums text-foreground/80">{String(value)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Applied over {model.label}&rsquo;s defaults.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {projects.length > 0 && (
        <div className="space-y-2">
          <FieldLabel htmlFor="composer-project">Project</FieldLabel>
          <Select
            value={targetProjectId ?? undefined}
            onValueChange={setTargetProjectId}
            disabled={submitting}
          >
            <SelectTrigger id="composer-project">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                  {project.isDefault ? ' · default' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      </div>

      {/* action bar */}
      <div className="shrink-0 space-y-3 border-t border-border bg-surface-2/40 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow text-muted-foreground">Cost</span>
          <span
            className={cn(
              'inline-flex items-baseline gap-1.5 font-display text-2xl font-semibold tabular-nums',
              affordable ? 'text-credit' : 'text-danger',
            )}
          >
            {cost}
            <span className="text-xs font-normal text-muted-foreground">
              {cost === 1 ? 'credit' : 'credits'}
            </span>
          </span>
        </div>

        {state.preset && cost !== modelCost && (
          <p className="text-right text-xs tabular-nums text-muted-foreground">
            {model.label} {modelCost} + {state.preset.title} {cost - modelCost}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting || !affordable}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate
            </>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {affordable
            ? `Balance after this: ${(credits - cost).toLocaleString()}`
            : `You need ${(cost - credits).toLocaleString()} more credits for this one.`}
        </p>
      </div>
    </form>
  )
}

/**
 * The composer's field label.
 *
 * Renders a real `<label>` when it is given an id to point at and a `<span>`
 * when it is not — a `<label for>` aimed at a radio group or a Radix trigger
 * points at nothing, and a label that labels nothing is worse than a span,
 * because a screen reader announces it as though it worked.
 */
function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string
  children: React.ReactNode
}) {
  const className = 'block text-xs font-medium text-muted-foreground'
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <span className={className}>{children}</span>
  )
}
