import { defaultModelForTask, getModel } from '@/lib/ai/registry'
import type { GenerationRow, GenerationTask } from '@/types/database'

/**
 * Turning someone else's shot into your starting point.
 *
 * A pure mapping, kept out of the composer so the rules are testable and so
 * there is exactly one place that decides what a remix inherits — and, more
 * importantly, what it does not.
 */

export interface RemixDraft {
  task: GenerationTask
  modelId: string
  prompt: string
  negativePrompt: string
  aspectRatio: string
  durationSec: number | null
  imageUrl: string | null
  presetId: string | null
  /** Lineage, written to `parent_id` on the new generation. */
  parentId: string
}

export function buildRemixDraft(
  source: Pick<
    GenerationRow,
    | 'id'
    | 'task'
    | 'model_id'
    | 'prompt'
    | 'negative_prompt'
    | 'input_image_url'
    | 'aspect_ratio'
    | 'duration_sec'
    | 'preset_id'
  >,
  options: { isOwn: boolean },
): RemixDraft {
  // A model can be retired from the registry between the original render and
  // the remix. Falling back to the task's default keeps the button working
  // instead of opening a composer that cannot submit.
  const model = getModel(source.model_id) ?? defaultModelForTask(source.task)

  const aspectRatio = model.supports.aspectRatios.includes(source.aspect_ratio)
    ? source.aspect_ratio
    : (model.supports.aspectRatios[0] ?? '16:9')

  const durations = model.supports.durations
  const durationSec =
    durations && durations.length > 0
      ? source.duration_sec && durations.includes(source.duration_sec)
        ? source.duration_sec
        : durations[0]!
      : null

  return {
    task: model.task,
    modelId: model.id,
    // What the author typed, not `resolved_prompt`: the preset re-applies its
    // own fragment, and carrying the resolved string would append it twice.
    prompt: source.prompt,
    // Only when there was no preset. With one, the preset supplies the
    // negative prompt, and pre-filling the box with its text would turn an
    // automatic default into something the user now has to maintain.
    negativePrompt:
      model.supports.negativePrompt && !source.preset_id ? (source.negative_prompt ?? '') : '',
    aspectRatio,
    durationSec,
    // The start frame is carried only for your own work.
    //
    // An uploaded frame lives in the private `uploads` bucket and is reachable
    // only through a signed URL. Handing that URL to a stranger because they
    // pressed Remix would leak one user's upload to another, so a remix of
    // someone else's shot starts with an empty image slot — which is also the
    // point of the feature: their look, your subject.
    imageUrl: options.isOwn && model.supports.imageInput ? source.input_image_url : null,
    presetId: source.preset_id,
    parentId: source.id,
  }
}
