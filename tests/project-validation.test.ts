import { describe, expect, it } from 'vitest'

import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_TITLE_MAX,
  createProjectSchema,
  updateProjectSchema,
} from '@/lib/validation/project'
import { updateProfileSchema } from '@/lib/validation/profile'

/**
 * The schemas the dialogs and the Server Actions share.
 *
 * The title bounds matter beyond tidiness: 0001_schema.sql declares
 * `check (char_length(title) between 1 and 80)`, so anything this accepts and
 * Postgres rejects surfaces as a 500 rather than a field error.
 */

describe('createProjectSchema', () => {
  it('accepts a plain title', () => {
    const result = createProjectSchema.safeParse({ title: 'Launch film' })
    expect(result.success).toBe(true)
  })

  it('trims before measuring, so whitespace is not a title', () => {
    const result = createProjectSchema.safeParse({ title: '   ' })
    expect(result.success).toBe(false)
  })

  it('accepts a title at the database limit', () => {
    const result = createProjectSchema.safeParse({ title: 'x'.repeat(PROJECT_TITLE_MAX) })
    expect(result.success).toBe(true)
  })

  it('rejects one character past it, which is where the check constraint bites', () => {
    const result = createProjectSchema.safeParse({ title: 'x'.repeat(PROJECT_TITLE_MAX + 1) })
    expect(result.success).toBe(false)
  })

  it('treats an empty description as absent rather than invalid', () => {
    const result = createProjectSchema.safeParse({ title: 'Launch', description: '' })
    expect(result.success).toBe(true)
  })

  it('caps the description', () => {
    const result = createProjectSchema.safeParse({
      title: 'Launch',
      description: 'x'.repeat(PROJECT_DESCRIPTION_MAX + 1),
    })
    expect(result.success).toBe(false)
  })
})

describe('updateProjectSchema', () => {
  it('requires a real project id', () => {
    expect(updateProjectSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })

  it('allows a patch that changes nothing but the cover', () => {
    const result = updateProjectSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000000',
      coverUrl: 'https://example.com/a.png',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a null cover, which is how a cover is cleared', () => {
    const result = updateProjectSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000000',
      coverUrl: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('updateProfileSchema', () => {
  it('lowercases the handle, because the unique index compares that way', () => {
    const result = updateProfileSchema.safeParse({ handle: 'AdaLovelace' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.handle).toBe('adalovelace')
  })

  it('rejects punctuation that would not survive a URL', () => {
    expect(updateProfileSchema.safeParse({ handle: 'ada lovelace' }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ handle: 'ada.lovelace' }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ handle: 'ada@home' }).success).toBe(false)
  })

  it('accepts underscores and digits', () => {
    expect(updateProfileSchema.safeParse({ handle: 'ada_99' }).success).toBe(true)
  })

  it('enforces the length bounds', () => {
    expect(updateProfileSchema.safeParse({ handle: 'ab' }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ handle: 'a'.repeat(25) }).success).toBe(false)
  })

  it('treats an empty display name as clearing it, not as an error', () => {
    const result = updateProfileSchema.safeParse({ handle: 'ada', displayName: '' })
    expect(result.success).toBe(true)
  })
})
