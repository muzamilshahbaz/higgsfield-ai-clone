import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CATEGORY_TAGS,
  EXPLORE_CATEGORIES,
  MAX_CATEGORIES,
  TAG_LABELS,
  isCategoryTag,
  isExploreCategory,
  normaliseCategories,
  suggestCategories,
} from '@/lib/categories'

/**
 * The category vocabulary lives in two places that cannot be allowed to drift:
 * the check constraint in migration 0013, which is what actually stops a bad
 * tag reaching the table, and `lib/categories.ts`, which is what the UI
 * offers.
 *
 * If they disagree the failure is quiet and nasty — a chip the user can tick
 * that produces a 23514 on publish, or a tag in the database that no filter
 * can find. This test reads the migration and compares.
 */

const MIGRATION = readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', '0013_explore_social.sql'),
  'utf8',
)

describe('category vocabulary', () => {
  /**
   * The body of the check constraint.
   *
   * Anchored on the `add constraint` clause rather than on the name alone:
   * the name also appears in the `if not exists` guard above it, and matching
   * that one finds a few words of DDL with no vocabulary in them.
   */
  const constraint = MIGRATION.match(
    /add constraint generations_categories_allowed\s+check \(([\s\S]*?)\n\s*\);/,
  )?.[1]

  it('has a check constraint to compare against', () => {
    expect(constraint, 'the check constraint is missing from migration 0013').toBeTruthy()
  })

  it('matches the slugs the database check constraint allows', () => {
    const allowed = [...constraint!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!)

    expect(allowed.length).toBeGreaterThan(0)
    expect(new Set(allowed)).toEqual(new Set(CATEGORY_TAGS))
  })

  it('caps selections at the same number the constraint does', () => {
    const cap = constraint!.match(/array_length\(categories, 1\), 0\) <= (\d+)/)

    expect(cap, 'the constraint no longer caps the array length').toBeTruthy()
    expect(Number(cap![1])).toBe(MAX_CATEGORIES)
  })

  it('gives every tag a label', () => {
    for (const slug of CATEGORY_TAGS) {
      expect(TAG_LABELS[slug], `${slug} has no label`).toBeTruthy()
    }
  })

  it('exposes every tag as a browsable category, plus the derived ones', () => {
    const slugs = EXPLORE_CATEGORIES.map((entry) => entry.slug)

    for (const tag of CATEGORY_TAGS) expect(slugs).toContain(tag)
    for (const derived of ['all', 'trending', 'images', 'videos']) {
      expect(slugs).toContain(derived)
    }

    // No duplicates: two chips with the same slug would both look selected.
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('isCategoryTag', () => {
  it('accepts only the writable tags', () => {
    expect(isCategoryTag('anime')).toBe(true)
    expect(isCategoryTag('cinematic')).toBe(true)

    // Derived categories are browsable but must never be written to a row.
    expect(isCategoryTag('trending')).toBe(false)
    expect(isCategoryTag('images')).toBe(false)
    expect(isCategoryTag('all')).toBe(false)

    expect(isCategoryTag('')).toBe(false)
    expect(isCategoryTag(null)).toBe(false)
    expect(isCategoryTag(42)).toBe(false)
  })
})

describe('isExploreCategory', () => {
  it('accepts anything the feed knows how to serve', () => {
    expect(isExploreCategory('trending')).toBe(true)
    expect(isExploreCategory('videos')).toBe(true)
    expect(isExploreCategory('fantasy')).toBe(true)

    expect(isExploreCategory('nonsense')).toBe(false)
    expect(isExploreCategory(null)).toBe(false)
  })
})

describe('normaliseCategories', () => {
  it('drops anything that is not a real tag', () => {
    expect(normaliseCategories(['anime', 'trending', 'nope', 42, null])).toEqual(['anime'])
  })

  it('de-duplicates', () => {
    expect(normaliseCategories(['anime', 'anime', 'anime'])).toEqual(['anime'])
  })

  it('caps at the limit the constraint enforces', () => {
    const result = normaliseCategories([...CATEGORY_TAGS])
    expect(result).toHaveLength(MAX_CATEGORIES)
  })

  it('returns catalogue order, not click order', () => {
    // Two shots tagged the same way must render their chips the same way.
    const a = normaliseCategories(['nature', 'anime'])
    const b = normaliseCategories(['anime', 'nature'])
    expect(a).toEqual(b)
  })
})

describe('suggestCategories', () => {
  it('reads the obvious cases out of a prompt', () => {
    expect(suggestCategories('a cinematic portrait of a woman, 35mm')).toContain('portraits')
    expect(suggestCategories('a cinematic portrait of a woman, 35mm')).toContain('cinematic')
    expect(suggestCategories('anime girl in the rain')).toContain('anime')
    expect(suggestCategories('a perfume bottle on marble, studio lighting')).toContain('product')
  })

  it('suggests nothing for a prompt it cannot read', () => {
    // The honest outcome. Guessing here would tag the public feed wrongly.
    expect(suggestCategories('')).toEqual([])
    expect(suggestCategories('zzzz qqqq')).toEqual([])
  })

  it('never suggests more than the cap', () => {
    const everything =
      'cinematic anime portrait of a dragon in a brutalist building, product packshot, abstract fractal forest'
    expect(suggestCategories(everything).length).toBeLessThanOrEqual(MAX_CATEGORIES)
  })

  /**
   * The regression this matching was rewritten for.
   *
   * A plain substring search tagged "a ceramic vase on a plinth, seamless
   * studio backdrop" as Nature, because "seamless" contains "sea". Each case
   * below is a word that hides another word, and each one would have put
   * somebody's shot in the wrong part of a public feed.
   */
  it('matches whole words, not substrings', () => {
    expect(suggestCategories('a seamless studio backdrop')).not.toContain('nature')
    expect(suggestCategories('a glass of whisky on oak')).not.toContain('nature')
    expect(suggestCategories('a humane gesture')).not.toContain('portraits')
    expect(suggestCategories('romantic lighting on brickwork')).not.toContain('portraits')
    // …while the words themselves still match.
    expect(suggestCategories('the sea at dawn')).toContain('nature')
    expect(suggestCategories('a man on a bridge')).toContain('portraits')
  })

  it('matches a simple plural of a keyword', () => {
    expect(suggestCategories('two bottles on a shelf')).toContain('product')
    expect(suggestCategories('mountains at dusk')).toContain('nature')
  })

  it('handles keywords containing punctuation and digits', () => {
    expect(suggestCategories('a sci-fi corridor')).toContain('fantasy')
    expect(suggestCategories('shot on 35mm film')).toContain('cinematic')
  })

  it('reads the seeded demo prompts the way a person would', () => {
    // The six prompts scripts/demo.ts publishes, which is what a fresh
    // deployment's Explore feed is made of.
    expect(suggestCategories('a ceramic vase on a plinth, seamless studio backdrop')).toContain(
      'product',
    )
    expect(
      suggestCategories('a detective at a rain-streaked window, venetian blinds, 1940s'),
    ).not.toContain('nature')
    expect(suggestCategories('a lone figure on a cliff edge at golden hour, long lens')).toContain(
      'nature',
    )
  })

  it('only ever suggests writable tags', () => {
    for (const slug of suggestCategories('a cinematic anime forest portrait')) {
      expect(isCategoryTag(slug)).toBe(true)
    }
  })
})
