import { describe, expect, it } from 'vitest'

import {
  MODELS,
  creditCostFor,
  defaultModelForTask,
  getModel,
  modelsForTask,
  primaryProvider,
  requireModel,
  routeFor,
  type ModelEntry,
} from '@/lib/ai/registry'
import { ASPECT_RATIOS, VIDEO_DURATIONS } from '@/lib/constants'
import type { GenerationTask } from '@/types/database'

const TASKS: GenerationTask[] = ['text_to_image', 'text_to_video', 'image_to_video']

describe('model registry integrity', () => {
  it('has unique ids', () => {
    const ids = MODELS.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('charges a positive whole number of credits for every model', () => {
    for (const model of MODELS) {
      expect(Number.isInteger(model.credits), `${model.id} credits`).toBe(true)
      expect(model.credits, `${model.id} credits`).toBeGreaterThan(0)
    }
  })

  it('only advertises aspect ratios the composer can offer', () => {
    const known = new Set(ASPECT_RATIOS.map((entry) => entry.value))
    for (const model of MODELS) {
      expect(model.supports.aspectRatios.length, `${model.id} ratios`).toBeGreaterThan(0)
      for (const ratio of model.supports.aspectRatios) {
        expect(known.has(ratio as never), `${model.id} -> ${ratio}`).toBe(true)
      }
    }
  })

  // The bug this guards: constants listed 8s (no model made it) and omitted 6s
  // (motion-scene's only length), so the duration picker offered dead options
  // and had no label for a real one.
  it('only advertises durations the duration picker has a label for', () => {
    const known = new Set<number>(VIDEO_DURATIONS.map((entry) => entry.value))
    for (const model of MODELS) {
      for (const duration of model.supports.durations ?? []) {
        expect(known.has(duration), `${model.id} -> ${duration}s has no label`).toBe(true)
      }
    }
  })

  it('offers no duration that no model can produce', () => {
    const supported = new Set(MODELS.flatMap((model) => model.supports.durations ?? []))
    for (const entry of VIDEO_DURATIONS) {
      expect(supported.has(entry.value), `${entry.value}s is offered but unsupported`).toBe(true)
    }
  })

  it('gives every video model at least one duration and every image model none', () => {
    for (const model of MODELS) {
      if (model.task === 'text_to_image') {
        expect(model.supports.durations, `${model.id}`).toBeUndefined()
      } else {
        expect(model.supports.durations?.length ?? 0, `${model.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('only marks imageInput on tasks that take a start frame', () => {
    for (const model of MODELS) {
      expect(model.supports.imageInput, `${model.id}`).toBe(model.task === 'image_to_video')
    }
  })

  // The router walks `routes` and stops at the first provider it has a key
  // for. An entry with no routes would be a model the composer offers and
  // nothing can run.
  it('gives every model at least one provider route', () => {
    for (const model of MODELS) {
      expect(model.routes.length, `${model.id} routes`).toBeGreaterThan(0)
    }
  })

  it('never lists the same provider twice in one route list', () => {
    for (const model of MODELS) {
      const providers = model.routes.map((route) => route.provider)
      expect(new Set(providers).size, `${model.id} routes`).toBe(providers.length)
    }
  })

  it('never routes a model to the mock driver', () => {
    // The mock is reachable only through AI_ALLOW_MOCK_FALLBACK, deliberately.
    // A registry entry naming it would make stand-in media the normal path.
    for (const model of MODELS) {
      for (const route of model.routes) {
        expect(route.provider, `${model.id}`).not.toBe('mock')
      }
    }
  })

  it('names a non-empty provider path on every route', () => {
    for (const model of MODELS) {
      for (const route of model.routes) {
        expect(route.path.trim().length, `${model.id} -> ${route.provider}`).toBeGreaterThan(0)
      }
    }
  })

  it('attributes a model to the first provider in its route list', () => {
    for (const model of MODELS) {
      expect(primaryProvider(model), model.id).toBe(model.routes[0]!.provider)
      expect(routeFor(model, primaryProvider(model))?.path, model.id).toBe(model.routes[0]!.path)
    }
  })

  it('names the open-weight model behind every id', () => {
    for (const model of MODELS) {
      expect(model.family.trim().length, `${model.id} family`).toBeGreaterThan(0)
    }
  })

  it('declares a frame rate on every route that has to convert a duration', () => {
    // num_frames = duration x fps + 1. A route that takes frames but declares
    // no rate would silently produce whatever length the model defaults to,
    // which is not what the user was charged for.
    for (const model of MODELS) {
      for (const route of model.routes) {
        if (route.videoFrameRate === undefined) continue
        expect(model.task, `${model.id}`).not.toBe('text_to_image')
        expect(route.videoFrameRate, `${model.id} -> ${route.provider}`).toBeGreaterThan(0)
      }
    }
  })

  it('resolves a model for every task', () => {
    for (const task of TASKS) {
      expect(modelsForTask(task).length, task).toBeGreaterThan(0)
      expect(defaultModelForTask(task).task).toBe(task)
    }
  })

  it('prefers a featured model as the default when one exists', () => {
    for (const task of TASKS) {
      const candidates = modelsForTask(task)
      const chosen = defaultModelForTask(task)
      if (candidates.some((model) => model.featured)) {
        expect(chosen.featured, task).toBe(true)
      }
    }
  })
})

describe('getModel / requireModel', () => {
  it('returns undefined rather than throwing for an unknown id', () => {
    expect(getModel('does-not-exist')).toBeUndefined()
  })

  it('throws a named error for an unknown id', () => {
    expect(() => requireModel('does-not-exist')).toThrow(/Unknown model id: does-not-exist/)
  })

  it('round-trips every registered id', () => {
    for (const model of MODELS) {
      expect(requireModel(model.id)).toBe(model)
    }
  })
})

describe('creditCostFor', () => {
  const video = (durations: number[], credits: number): ModelEntry =>
    ({
      id: 'test-video',
      label: 'Test',
      blurb: '',
      task: 'image_to_video',
      family: 'Test model',
      routes: [{ provider: 'fal', path: 'test/model' }],
      credits,
      indicativeUsd: 0,
      avgLatencySec: 10,
      supports: { aspectRatios: ['16:9'], durations, imageInput: true, negativePrompt: false },
    }) satisfies ModelEntry

  it('charges the flat rate for a model with no durations', () => {
    const image = requireModel('lumen-pro')
    expect(creditCostFor(image)).toBe(image.credits)
    expect(creditCostFor(image, 10)).toBe(image.credits)
  })

  it('charges the flat rate at or below the shortest supported duration', () => {
    const model = video([5, 10], 30)
    expect(creditCostFor(model, 5)).toBe(30)
    expect(creditCostFor(model, 3)).toBe(30)
  })

  it('scales linearly off the shortest duration', () => {
    const model = video([5, 10], 30)
    expect(creditCostFor(model, 10)).toBe(60)
  })

  it('rounds a partial multiple up, never down', () => {
    const model = video([5, 10], 35)
    expect(creditCostFor(model, 7)).toBe(49)
    expect(creditCostFor(model, 8)).toBe(56)
  })

  it('never charges less than the base rate', () => {
    for (const model of MODELS) {
      for (const duration of [undefined, null, 0, 1, 5, 6, 10, 60]) {
        expect(creditCostFor(model, duration), `${model.id} @ ${duration}`).toBeGreaterThanOrEqual(
          model.credits,
        )
      }
    }
  })

  it('always returns a whole number of credits', () => {
    const model = video([5], 18)
    for (const duration of [5, 6, 7, 8, 9, 10, 11]) {
      expect(Number.isInteger(creditCostFor(model, duration)), `${duration}s`).toBe(true)
    }
  })

  it('prices the real catalogue as expected', () => {
    expect(creditCostFor(requireModel('lumen-flash'))).toBe(1)
    expect(creditCostFor(requireModel('motion-turbo'), 5)).toBe(14)
    expect(creditCostFor(requireModel('motion-cine'), 5)).toBe(30)
    expect(creditCostFor(requireModel('motion-cine'), 10)).toBe(60)
    expect(creditCostFor(requireModel('motion-cog'), 6)).toBe(16)
  })
})
