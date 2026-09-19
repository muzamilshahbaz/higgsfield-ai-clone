import { z } from 'zod'

import { getModel } from '@/lib/ai/registry'
import { ASPECT_RATIOS, LIMITS, VIDEO_DURATIONS } from '@/lib/constants'

/**
 * Generation input schemas.
 *
 * Shared by the composer and the route handler, so the button disables for the
 * same reasons the server would reject — the user never discovers a rule by
 * being charged nothing and shown a 400.
 *
 * Everything model-specific (which aspect ratios, which durations, whether a
 * start frame is required) is checked against lib/ai/registry.ts rather than
 * hardcoded here, so adding a model needs no edit in this file.
 */

const ASPECT_VALUES = ASPECT_RATIOS.map((a) => a.value) as [string, ...string[]]
const DURATION_VALUES: number[] = VIDEO_DURATIONS.map((d) => d.value)

export const generationTaskSchema = z.enum(['text_to_image', 'text_to_video', 'image_to_video'])

/** An https URL, or a same-origin path like the bundled mock samples. */
const mediaUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'That does not look like an image URL.',
  })

export const createGenerationSchema = z
  .object({
    /** Client-generated; makes a double-clicked Generate button a no-op. */
    idempotencyKey: z.string().trim().min(8, 'Missing idempotency key.').max(80),
    task: generationTaskSchema,
    modelId: z.string().trim().min(1, 'Pick a model.'),
    presetId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    parentId: z.string().uuid().nullish(),
    prompt: z
      .string()
      .trim()
      .max(LIMITS.maxPromptLength, `Keep the prompt under ${LIMITS.maxPromptLength} characters.`),
    negativePrompt: z.string().trim().max(600, 'Keep the negative prompt under 600 characters.').nullish(),
    imageUrl: mediaUrl.nullish(),
    aspectRatio: z.enum(ASPECT_VALUES),
    durationSec: z.number().int().positive().nullish(),
    seed: z.number().int().min(0).max(2_147_483_647).nullish(),
  })
  .superRefine((input, ctx) => {
    const model = getModel(input.modelId)

    if (!model) {
      ctx.addIssue({ code: 'custom', path: ['modelId'], message: 'That model no longer exists.' })
      return
    }

    if (model.task !== input.task) {
      ctx.addIssue({
        code: 'custom',
        path: ['modelId'],
        message: `${model.label} cannot do that job.`,
      })
    }

    // A preset carries its own prompt fragment, so an empty box is fine there
    // and only there.
    if (!input.presetId && input.prompt.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['prompt'], message: 'Describe the shot you want.' })
    }

    if (!model.supports.aspectRatios.includes(input.aspectRatio)) {
      ctx.addIssue({
        code: 'custom',
        path: ['aspectRatio'],
        message: `${model.label} does not support ${input.aspectRatio}.`,
      })
    }

    const durations = model.supports.durations
    if (durations && durations.length > 0) {
      if (input.durationSec == null) {
        ctx.addIssue({ code: 'custom', path: ['durationSec'], message: 'Pick a duration.' })
      } else if (!durations.includes(input.durationSec)) {
        ctx.addIssue({
          code: 'custom',
          path: ['durationSec'],
          message: `${model.label} renders ${durations.join('s or ')}s clips.`,
        })
      } else if (!DURATION_VALUES.includes(input.durationSec)) {
        // The registry offers a length the picker has no label for. Caught by
        // tests/registry.test.ts too; this is the runtime backstop.
        ctx.addIssue({ code: 'custom', path: ['durationSec'], message: 'Unsupported duration.' })
      }
    } else if (input.durationSec != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationSec'],
        message: 'This model does not take a duration.',
      })
    }

    if (model.supports.imageInput && !input.imageUrl) {
      ctx.addIssue({ code: 'custom', path: ['imageUrl'], message: 'Add a start frame.' })
    }

    if (!model.supports.imageInput && input.imageUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['imageUrl'],
        message: `${model.label} does not take a start frame.`,
      })
    }

    if (!model.supports.negativePrompt && input.negativePrompt) {
      ctx.addIssue({
        code: 'custom',
        path: ['negativePrompt'],
        message: `${model.label} ignores negative prompts.`,
      })
    }
  })

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>

/** Uploads: mirrors the constraints declared on the storage bucket itself. */
export const UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(UPLOAD_MIME_TYPES, {
    errorMap: () => ({ message: 'Use a PNG, JPEG or WebP image.' }),
  }),
  sizeBytes: z
    .number()
    .int()
    .positive('That file is empty.')
    .max(LIMITS.maxUploadBytes, 'Images must be 10MB or smaller.'),
})

/** Flattens a ZodError into `{ field: firstMessage }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    const name = typeof key === 'string' ? key : '_'
    if (!out[name]) out[name] = issue.message
  }
  return out
}
