import { describe, expect, it } from 'vitest'

import { requireModel } from '@/lib/ai/registry'
import {
  presetLikeFromRow,
  resolveCreditCost,
  resolveNegativePrompt,
  resolveParams,
  resolvePrompt,
  toPresetSummary,
  type PresetLike,
} from '@/lib/presets'
import type { PresetRow } from '@/types/database'

/**
 * These four helpers are the contract between the composer's quote and the
 * row the server writes. The composer shows a price and a prompt before the
 * request leaves the browser; `generation.service` computes both again on the
 * way in. If they could disagree, a user would be quoted one number and
 * charged another — so the behaviour is pinned here rather than trusted.
 */

const preset: PresetLike = {
  promptFragment: 'slow dolly in, anamorphic flare',
  negativePrompt: 'blurry, watermark',
  params: { guidance_scale: 5 },
  creditCost: 3,
}

const row: PresetRow = {
  id: '7f1a0d4e-0000-4000-8000-000000000001',
  slug: 'dolly-in',
  title: 'Dolly In',
  description: 'A patient push toward the subject.',
  kind: 'motion',
  category: 'camera',
  prompt_fragment: preset.promptFragment,
  negative_prompt: preset.negativePrompt,
  model_id: 'motion-cine',
  params: { guidance_scale: 5 },
  preview_video_url: '/samples/shot-01.svg',
  preview_poster_url: null,
  accent: '#7c5cff',
  credit_cost: 3,
  sort_order: 4,
  is_featured: true,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('resolvePrompt', () => {
  it('puts the user prompt first and the preset fragment after it', () => {
    expect(resolvePrompt('a lighthouse in a storm', preset)).toBe(
      'a lighthouse in a storm, slow dolly in, anamorphic flare',
    )
  })

  it('is the fragment alone when the prompt box was left empty', () => {
    expect(resolvePrompt('   ', preset)).toBe('slow dolly in, anamorphic flare')
  })

  it('is the prompt alone when no preset is chosen', () => {
    expect(resolvePrompt('  a lighthouse  ', null)).toBe('a lighthouse')
  })

  it('never leaves a dangling comma for an empty pairing', () => {
    expect(resolvePrompt('', null)).toBe('')
    expect(resolvePrompt('', { ...preset, promptFragment: '  ' })).toBe('')
  })
})

describe('resolveNegativePrompt', () => {
  const model = requireModel('motion-cine')

  it('prefers what the user typed', () => {
    expect(resolveNegativePrompt(model, 'text, logos', preset)).toBe('text, logos')
  })

  it('falls back to the preset when the field is empty or whitespace', () => {
    expect(resolveNegativePrompt(model, '   ', preset)).toBe('blurry, watermark')
    expect(resolveNegativePrompt(model, null, preset)).toBe('blurry, watermark')
  })

  it('is null when neither side has one', () => {
    expect(resolveNegativePrompt(model, null, null)).toBeNull()
  })

  it('drops both for a model that does not read negative prompts', () => {
    const noNegatives = requireModel('lumen-flash')
    expect(noNegatives.supports.negativePrompt).toBe(false)
    expect(resolveNegativePrompt(noNegatives, 'text, logos', preset)).toBeNull()
  })
})

describe('resolveParams', () => {
  const model = requireModel('lumen-pro')

  it('starts from the model defaults', () => {
    expect(resolveParams(model, null)).toEqual(model.defaults)
  })

  it('lets the preset override a default key and leaves the rest alone', () => {
    const merged = resolveParams(model, preset)
    expect(merged.guidance_scale).toBe(5)
    expect(merged.num_inference_steps).toBe(model.defaults?.num_inference_steps)
  })

  it('does not mutate the registry entry it merged from', () => {
    resolveParams(model, preset)
    expect(model.defaults?.guidance_scale).toBe(3.5)
  })

  it('is an empty object for a model with no defaults and no preset', () => {
    expect(resolveParams(requireModel('motion-turbo'), null)).toEqual({})
  })
})

describe('resolveCreditCost', () => {
  const model = requireModel('motion-cine')

  it('is the model price when no preset is chosen', () => {
    expect(resolveCreditCost(model, 5, null)).toBe(model.credits)
  })

  it('adds the preset surcharge on top of the model price', () => {
    expect(resolveCreditCost(model, 5, preset)).toBe(model.credits + 3)
  })

  it('applies the surcharge after the duration has scaled the model price', () => {
    // 10s is twice the 5s base, so the model doubles and the surcharge is flat.
    expect(resolveCreditCost(model, 10, preset)).toBe(model.credits * 2 + 3)
  })

  it('treats a zero-surcharge preset as free', () => {
    expect(resolveCreditCost(model, 5, { ...preset, creditCost: 0 })).toBe(model.credits)
  })
})

describe('row mapping', () => {
  it('projects a row into the shape the browser gets', () => {
    const summary = toPresetSummary(row)

    expect(summary).toMatchObject({
      id: row.id,
      slug: 'dolly-in',
      title: 'Dolly In',
      kind: 'motion',
      promptFragment: row.prompt_fragment,
      modelId: 'motion-cine',
      creditCost: 3,
      isFeatured: true,
    })
    // Columns the UI has no use for stay on the server.
    expect(summary).not.toHaveProperty('is_active')
    expect(summary).not.toHaveProperty('sort_order')
  })

  it('falls back to the preview when a preset has no separate poster', () => {
    expect(toPresetSummary(row).posterUrl).toBe('/samples/shot-01.svg')
  })

  it('narrows a non-object params column to an empty object', () => {
    // `params` is `Json`, so the database could hold an array or a scalar.
    expect(toPresetSummary({ ...row, params: ['nope'] }).params).toEqual({})
    expect(toPresetSummary({ ...row, params: null }).params).toEqual({})
  })

  it('produces a PresetLike the resolvers accept', () => {
    const like = presetLikeFromRow(row)
    expect(resolvePrompt('subject', like)).toBe(`subject, ${row.prompt_fragment}`)
    expect(resolveCreditCost(requireModel('motion-cine'), 5, like)).toBe(
      requireModel('motion-cine').credits + 3,
    )
  })
})
