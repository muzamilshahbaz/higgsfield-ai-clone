import { describe, expect, it } from 'vitest'

import presets from '../data/presets.json'
import { getModel } from '@/lib/ai/registry'

/**
 * data/presets.json is the source of truth the seed script pushes to the
 * database. A broken entry here would only surface at generation time — or,
 * worse, as a silently missing preview in the gallery — so it is checked
 * structurally before it can ever be seeded.
 */

type Preset = (typeof presets)[number]

describe('preset catalogue', () => {
  it('ships the planned 24 motion and 12 style presets', () => {
    const motion = presets.filter((preset) => preset.kind === 'motion')
    const style = presets.filter((preset) => preset.kind === 'style')

    expect(motion).toHaveLength(24)
    expect(style).toHaveLength(12)
    expect(presets).toHaveLength(36)
  })

  it('uses only the two supported kinds', () => {
    for (const preset of presets) {
      expect(['motion', 'style'], preset.slug).toContain(preset.kind)
    }
  })

  it('has unique slugs, since the seed upserts on slug', () => {
    const slugs = presets.map((preset) => preset.slug)
    const duplicates = slugs.filter((slug, index) => slugs.indexOf(slug) !== index)
    expect(duplicates).toEqual([])
  })

  it('uses lowercase kebab-case slugs', () => {
    for (const preset of presets) {
      expect(preset.slug, preset.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('has unique titles, so the picker is never ambiguous', () => {
    const titles = presets.map((preset) => preset.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('points every preset at a model that exists in the registry', () => {
    const unknown = presets
      .filter((preset) => !getModel(preset.modelId))
      .map((preset) => `${preset.slug} -> ${preset.modelId}`)
    expect(unknown).toEqual([])
  })

  it('routes motion presets to video models and style presets to image models', () => {
    for (const preset of presets) {
      const model = getModel(preset.modelId)!
      if (preset.kind === 'motion') {
        expect(model.task, `${preset.slug}`).not.toBe('text_to_image')
      } else {
        expect(model.task, `${preset.slug}`).toBe('text_to_image')
      }
    }
  })

  it('carries a non-trivial prompt fragment — that fragment is the product', () => {
    for (const preset of presets) {
      expect(preset.promptFragment.trim().length, preset.slug).toBeGreaterThan(20)
    }
  })

  it('describes every preset for the gallery card', () => {
    for (const preset of presets) {
      expect(preset.title.trim(), preset.slug).not.toBe('')
      expect(preset.description.trim().length, preset.slug).toBeGreaterThan(10)
      expect(preset.category.trim(), preset.slug).not.toBe('')
    }
  })

  it('references preview media by absolute url, never a bundled file', () => {
    // The bundled placeholders under public/samples are gone. A preview is a
    // real image somewhere, catalogued in `media_assets` and seeded into this
    // file by scripts/seed-media.ts — so a local path here would be a file
    // that no longer exists and a broken card in the grid.
    for (const preset of presets as Preset[]) {
      for (const url of [preset.previewVideoUrl, preset.previewPosterUrl]) {
        if (!url) continue
        expect(url, preset.slug).toMatch(/^https:\/\//)
        expect(url, preset.slug).not.toMatch(/^\/samples\//)
      }
    }
  })

  it('uses a valid hex accent colour', () => {
    for (const preset of presets) {
      expect(preset.accent, preset.slug).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('never carries a negative credit cost', () => {
    for (const preset of presets) {
      expect(Number.isInteger(preset.creditCost), preset.slug).toBe(true)
      expect(preset.creditCost, preset.slug).toBeGreaterThanOrEqual(0)
    }
  })

  it('has a whole-number sort order', () => {
    for (const preset of presets) {
      expect(Number.isInteger(preset.sortOrder), preset.slug).toBe(true)
    }
  })

  it('features enough presets to fill the gallery rail, but not all of them', () => {
    const featured = presets.filter((preset) => preset.isFeatured)
    expect(featured.length).toBeGreaterThanOrEqual(6)
    expect(featured.length).toBeLessThan(presets.length)
  })

  it('carries params as a plain object the merge step can spread', () => {
    for (const preset of presets) {
      expect(typeof preset.params, preset.slug).toBe('object')
      expect(Array.isArray(preset.params), preset.slug).toBe(false)
      expect(preset.params, preset.slug).not.toBeNull()
    }
  })

  /**
   * Preset params are merged over the model's registry defaults and sent
   * straight to the provider, so a key the model does not read is either
   * ignored silently or rejected by the API — both are bugs found in
   * production rather than here.
   */
  it('only sets params the target model actually reads', () => {
    const KNOBS: Record<string, string[]> = {
      'lumen-flash': ['num_inference_steps'],
      'lumen-pro': ['num_inference_steps', 'guidance_scale'],
      'lumen-portrait': ['num_inference_steps', 'guidance_scale'],
      'motion-turbo': ['cfg_scale'],
      'motion-cine': ['cfg_scale'],
      'motion-scene': ['cfg_scale'],
    }

    const offenders: string[] = []
    for (const preset of presets) {
      const allowed = KNOBS[preset.modelId] ?? []
      for (const key of Object.keys(preset.params)) {
        if (!allowed.includes(key)) offenders.push(`${preset.slug}.${key} (${preset.modelId})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps every param value a finite number the provider can take', () => {
    for (const preset of presets) {
      for (const [key, value] of Object.entries(preset.params as Record<string, unknown>)) {
        expect(Number.isFinite(value), `${preset.slug}.${key}`).toBe(true)
      }
    }
  })

  it('exercises the params merge and the surcharge somewhere in the catalogue', () => {
    // Both are optional per preset, but a catalogue where neither is ever set
    // means the merge in lib/presets.ts is dead code in practice.
    expect(presets.some((preset) => Object.keys(preset.params).length > 0)).toBe(true)
    expect(presets.some((preset) => preset.creditCost > 0)).toBe(true)
  })

  it('keeps every surcharge small next to the model price it is added to', () => {
    for (const preset of presets) {
      const model = getModel(preset.modelId)!
      expect(preset.creditCost, preset.slug).toBeLessThanOrEqual(Math.ceil(model.credits / 2))
    }
  })
})
