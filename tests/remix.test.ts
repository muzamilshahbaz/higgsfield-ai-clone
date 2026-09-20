import { describe, expect, it } from 'vitest'

import { getModel, MODELS } from '@/lib/ai/registry'
import { buildRemixDraft } from '@/lib/remix'
import { isExploreSort } from '@/lib/explore'
import type { GenerationRow } from '@/types/database'

/**
 * What a remix inherits — and what it must not.
 *
 * The privacy rule is the one worth a test: a start frame lives in the private
 * `uploads` bucket behind a signed URL, so carrying it into someone else's
 * composer would hand them another user's upload.
 */

const videoModel = MODELS.find((model) => model.task === 'image_to_video')!
const imageModel = MODELS.find((model) => model.task === 'text_to_image')!

function sourceRow(overrides: Partial<GenerationRow> = {}) {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    task: videoModel.task,
    model_id: videoModel.id,
    prompt: 'a detective at a rain-streaked window',
    negative_prompt: 'blurry, watermark',
    input_image_url: 'https://storage.test/uploads/someone-else/frame.png?token=secret',
    aspect_ratio: videoModel.supports.aspectRatios[0]!,
    duration_sec: videoModel.supports.durations?.[0] ?? null,
    preset_id: null,
    ...overrides,
  } as Pick<
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
  >
}

describe('buildRemixDraft', () => {
  it('carries the settings that make the look reproducible', () => {
    const draft = buildRemixDraft(sourceRow(), { isOwn: true })

    expect(draft.modelId).toBe(videoModel.id)
    expect(draft.task).toBe(videoModel.task)
    expect(draft.prompt).toBe('a detective at a rain-streaked window')
    expect(draft.aspectRatio).toBe(videoModel.supports.aspectRatios[0])
    expect(draft.parentId).toBe('aaaaaaaa-0000-4000-8000-000000000001')
  })

  it('never hands someone else a private start frame', () => {
    const draft = buildRemixDraft(sourceRow(), { isOwn: false })
    expect(draft.imageUrl).toBeNull()
  })

  it('keeps your own start frame, so remixing your own shot is a real starting point', () => {
    const draft = buildRemixDraft(sourceRow(), { isOwn: true })
    expect(draft.imageUrl).toBe(sourceRow().input_image_url)
  })

  it('drops the start frame when the model cannot take one', () => {
    const draft = buildRemixDraft(
      sourceRow({ task: imageModel.task, model_id: imageModel.id }),
      { isOwn: true },
    )
    expect(draft.imageUrl).toBeNull()
    expect(draft.task).toBe(imageModel.task)
  })

  it('falls back to the task default when the model has been retired', () => {
    const draft = buildRemixDraft(sourceRow({ model_id: 'model-that-no-longer-exists' }), {
      isOwn: true,
    })

    expect(getModel(draft.modelId)).toBeDefined()
    expect(getModel(draft.modelId)!.task).toBe(videoModel.task)
  })

  it('coerces an aspect ratio the model does not support', () => {
    const unsupported = ['16:9', '9:16', '1:1', '4:5', '21:9'].find(
      (ratio) => !videoModel.supports.aspectRatios.includes(ratio),
    )
    if (!unsupported) return // every model takes every ratio; nothing to prove

    const draft = buildRemixDraft(sourceRow({ aspect_ratio: unsupported }), { isOwn: true })
    expect(videoModel.supports.aspectRatios).toContain(draft.aspectRatio)
  })

  it('coerces a duration the model does not offer', () => {
    const draft = buildRemixDraft(sourceRow({ duration_sec: 999 }), { isOwn: true })

    if (videoModel.supports.durations?.length) {
      expect(videoModel.supports.durations).toContain(draft.durationSec)
    } else {
      expect(draft.durationSec).toBeNull()
    }
  })

  it('leaves the negative prompt to the preset when there was one', () => {
    const draft = buildRemixDraft(
      sourceRow({ preset_id: 'bbbbbbbb-0000-4000-8000-000000000002' }),
      { isOwn: true },
    )
    expect(draft.negativePrompt).toBe('')
    expect(draft.presetId).toBe('bbbbbbbb-0000-4000-8000-000000000002')
  })

  it('never carries the seed, so a remix is a new shot rather than a copy', () => {
    const draft = buildRemixDraft(sourceRow(), { isOwn: true })
    expect(draft).not.toHaveProperty('seed')
  })
})

describe('isExploreSort', () => {
  it('accepts the two sorts the feed offers', () => {
    expect(isExploreSort('new')).toBe(true)
    expect(isExploreSort('top')).toBe(true)
  })

  it('rejects anything else, so a hand-typed query cannot reach the query builder', () => {
    expect(isExploreSort('like_count; drop table')).toBe(false)
    expect(isExploreSort(null)).toBe(false)
    expect(isExploreSort(undefined)).toBe(false)
    expect(isExploreSort('')).toBe(false)
  })
})
