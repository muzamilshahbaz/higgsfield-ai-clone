'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Coins, Loader2, Sparkles } from 'lucide-react'

import { ImageDrop } from '@/components/composer/image-drop'
import { ModelSelector } from '@/components/composer/model-selector'
import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useGenerationFeed } from '@/hooks/use-generation-feed'
import { creditCostFor, defaultModelForTask, getModel } from '@/lib/ai/registry'
import { ASPECT_RATIOS, LIMITS, TASK_LABELS, VIDEO_DURATIONS } from '@/lib/constants'
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
 */

const TASKS: GenerationTask[] = ['text_to_image', 'text_to_video', 'image_to_video']

interface ComposerState {
  task: GenerationTask
  modelId: string
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
    prompt: '',
    negativePrompt: '',
    imageUrl: null,
    aspectRatio: model.supports.aspectRatios[0] ?? '16:9',
    durationSec: model.supports.durations?.[0] ?? null,
    seed: '',
  }
}

export function Composer({ credits, projectId }: { credits: number; projectId?: string | null }) {
  const router = useRouter()
  const { upsert } = useGenerationFeed()

  const [state, setState] = React.useState<ComposerState>(() => initialStateFor('image_to_video'))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [advanced, setAdvanced] = React.useState(false)

  // Held across retries of the same click so a stutter in the network cannot
  // produce two jobs, and replaced only once a job actually exists.
  const idempotencyKeyRef = React.useRef(newIdempotencyKey())

  const model = getModel(state.modelId) ?? defaultModelForTask(state.task)
  const cost = creditCostFor(model, state.durationSec)
  const affordable = credits >= cost

  /** Moving to another task rebuilds every model-dependent field at once. */
  const selectTask = (task: GenerationTask) => {
    setErrors({})
    setState((current) => {
      const next = initialStateFor(task)
      // The prompt is the one thing worth carrying across.
      return { ...next, prompt: current.prompt }
    })
  }

  const selectModel = (modelId: string) => {
    const nextModel = getModel(modelId)
    if (!nextModel) return

    setErrors({})
    setState((current) => ({
      ...current,
      modelId,
      aspectRatio: nextModel.supports.aspectRatios.includes(current.aspectRatio)
        ? current.aspectRatio
        : (nextModel.supports.aspectRatios[0] ?? '16:9'),
      durationSec:
        nextModel.supports.durations && nextModel.supports.durations.length > 0
          ? (current.durationSec && nextModel.supports.durations.includes(current.durationSec)
              ? current.durationSec
              : nextModel.supports.durations[0]!)
          : null,
      imageUrl: nextModel.supports.imageInput ? current.imageUrl : null,
      negativePrompt: nextModel.supports.negativePrompt ? current.negativePrompt : '',
    }))
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
      projectId: projectId ?? undefined,
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
        toast.success(`Queued · ${cost} credits`)
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
      className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <Segmented
        name="What to make"
        value={state.task}
        onChange={selectTask}
        options={TASKS.map((task) => ({ value: task, label: TASK_LABELS[task] }))}
      />

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="prompt" className="text-xs font-medium text-muted-foreground">
            Prompt
          </label>
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
          rows={4}
          value={state.prompt}
          aria-invalid={Boolean(errors.prompt)}
          placeholder="A lighthouse in a storm, waves breaking over the rocks, dusk, anamorphic"
          onChange={(event) => setState((current) => ({ ...current, prompt: event.target.value }))}
        />
        {errors.prompt && <p className="text-xs text-danger">{errors.prompt}</p>}
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

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Aspect ratio</span>
        <Segmented
          name="Aspect ratio"
          size="sm"
          value={state.aspectRatio}
          options={aspectOptions}
          onChange={(aspectRatio) => setState((current) => ({ ...current, aspectRatio }))}
        />
      </div>

      {durationOptions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Duration</span>
          <Segmented
            name="Duration"
            size="sm"
            value={state.durationSec ?? durationOptions[0]!.value}
            options={durationOptions}
            onChange={(durationSec) => setState((current) => ({ ...current, durationSec }))}
          />
        </div>
      )}

      <div className="space-y-3 border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={advanced}
        >
          {advanced ? 'Hide advanced' : 'Advanced'}
        </button>

        {advanced && (
          <div className="space-y-3">
            {model.supports.negativePrompt && (
              <div className="space-y-1.5">
                <label htmlFor="negative" className="text-xs font-medium text-muted-foreground">
                  Negative prompt
                </label>
                <Textarea
                  id="negative"
                  rows={2}
                  value={state.negativePrompt}
                  placeholder="blurry, warped faces, watermark"
                  onChange={(event) =>
                    setState((current) => ({ ...current, negativePrompt: event.target.value }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="seed" className="text-xs font-medium text-muted-foreground">
                Seed
              </label>
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
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Cost</span>
          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
            <Coins className={cn('size-4', affordable ? 'text-credit' : 'text-danger')} aria-hidden />
            {cost} {cost === 1 ? 'credit' : 'credits'}
          </span>
        </div>

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
