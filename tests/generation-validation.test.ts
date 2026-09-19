import { describe, expect, it } from 'vitest'

import { defaultModelForTask, requireModel } from '@/lib/ai/registry'
import { LIMITS } from '@/lib/constants'
import {
  createGenerationSchema,
  fieldErrors,
  uploadSchema,
} from '@/lib/validation/generation'

/**
 * The composer and the route handler run this same schema, so anything proven
 * here is true on both sides of the wire. That is the whole point of the file:
 * the button must disable for exactly the reasons the server would reject.
 */

const IMAGE_MODEL = defaultModelForTask('text_to_image')
const VIDEO_MODEL = requireModel('motion-cine')

function imageRequest(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'k_abcdef123456',
    task: 'text_to_image' as const,
    modelId: IMAGE_MODEL.id,
    prompt: 'a lighthouse in a storm',
    aspectRatio: '16:9',
    ...overrides,
  }
}

function videoRequest(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'k_abcdef123456',
    task: 'image_to_video' as const,
    modelId: VIDEO_MODEL.id,
    prompt: 'crash zoom toward the lantern room',
    aspectRatio: '16:9',
    durationSec: VIDEO_MODEL.supports.durations![0]!,
    imageUrl: 'https://example.com/frame.png',
    ...overrides,
  }
}

function errorFor(input: unknown, field: string): string | undefined {
  const parsed = createGenerationSchema.safeParse(input)
  if (parsed.success) return undefined
  return fieldErrors(parsed.error)[field]
}

describe('createGenerationSchema', () => {
  it('accepts a well-formed image request', () => {
    expect(createGenerationSchema.safeParse(imageRequest()).success).toBe(true)
  })

  it('accepts a well-formed video request', () => {
    expect(createGenerationSchema.safeParse(videoRequest()).success).toBe(true)
  })

  it('rejects a model that is not in the registry', () => {
    expect(errorFor(imageRequest({ modelId: 'nope' }), 'modelId')).toMatch(/no longer exists/i)
  })

  it('rejects a model that cannot do the requested task', () => {
    expect(errorFor(imageRequest({ modelId: VIDEO_MODEL.id }), 'modelId')).toMatch(/cannot do/i)
  })

  it('rejects an aspect ratio the model does not support', () => {
    // motion-turbo is 16:9 / 9:16 / 1:1 only.
    const turbo = requireModel('motion-turbo')
    const input = videoRequest({
      modelId: turbo.id,
      durationSec: turbo.supports.durations![0]!,
      aspectRatio: '21:9',
    })
    expect(errorFor(input, 'aspectRatio')).toMatch(/does not support/i)
  })

  it('rejects an aspect ratio that is not in the catalogue at all', () => {
    expect(createGenerationSchema.safeParse(imageRequest({ aspectRatio: '3:2' })).success).toBe(false)
  })

  describe('duration', () => {
    it('is required for a model that renders clips', () => {
      expect(errorFor(videoRequest({ durationSec: undefined }), 'durationSec')).toMatch(/pick a duration/i)
    })

    it('must be one the model offers', () => {
      expect(errorFor(videoRequest({ durationSec: 3 }), 'durationSec')).toMatch(/renders/i)
    })

    it('is refused by a model that takes no duration', () => {
      expect(errorFor(imageRequest({ durationSec: 5 }), 'durationSec')).toMatch(/does not take/i)
    })
  })

  describe('start frame', () => {
    it('is required by an image-to-video model', () => {
      expect(errorFor(videoRequest({ imageUrl: undefined }), 'imageUrl')).toMatch(/add a start frame/i)
    })

    it('is refused by a text-to-image model', () => {
      const input = imageRequest({ imageUrl: 'https://example.com/frame.png' })
      expect(errorFor(input, 'imageUrl')).toMatch(/does not take a start frame/i)
    })

    it('accepts a same-origin path, which is what the mock driver returns', () => {
      const parsed = createGenerationSchema.safeParse(videoRequest({ imageUrl: '/samples/shot-01.svg' }))
      expect(parsed.success).toBe(true)
    })

    it('rejects something that is not a URL at all', () => {
      expect(createGenerationSchema.safeParse(videoRequest({ imageUrl: 'frame.png' })).success).toBe(false)
    })
  })

  describe('prompt', () => {
    it('is required when no preset carries one', () => {
      expect(errorFor(imageRequest({ prompt: 'hi' }), 'prompt')).toMatch(/describe the shot/i)
    })

    it('may be empty when a preset supplies the fragment', () => {
      const input = imageRequest({
        prompt: '',
        presetId: '00000000-0000-4000-8000-000000000001',
      })
      expect(createGenerationSchema.safeParse(input).success).toBe(true)
    })

    it('is capped at the documented length', () => {
      const tooLong = 'x'.repeat(LIMITS.maxPromptLength + 1)
      expect(errorFor(imageRequest({ prompt: tooLong }), 'prompt')).toMatch(/under/i)
    })
  })

  it('ignores a negative prompt the model cannot use', () => {
    // lumen-flash advertises no negative prompt support.
    const input = imageRequest({ modelId: 'lumen-flash', negativePrompt: 'blurry' })
    expect(errorFor(input, 'negativePrompt')).toMatch(/ignores negative prompts/i)
  })

  it('requires an idempotency key long enough to be unique', () => {
    expect(createGenerationSchema.safeParse(imageRequest({ idempotencyKey: 'short' })).success).toBe(
      false,
    )
  })
})

describe('uploadSchema', () => {
  const valid = { fileName: 'frame.png', mimeType: 'image/png', sizeBytes: 1024 }

  it('accepts a small PNG', () => {
    expect(uploadSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a type the bucket would refuse anyway', () => {
    const parsed = uploadSchema.safeParse({ ...valid, mimeType: 'image/gif' })
    expect(parsed.success).toBe(false)
  })

  it('rejects anything over the documented size limit', () => {
    const parsed = uploadSchema.safeParse({ ...valid, sizeBytes: LIMITS.maxUploadBytes + 1 })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(fieldErrors(parsed.error).sizeBytes).toMatch(/10MB/i)
    }
  })

  it('rejects an empty file', () => {
    expect(uploadSchema.safeParse({ ...valid, sizeBytes: 0 }).success).toBe(false)
  })
})
