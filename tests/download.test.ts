import { describe, expect, it } from 'vitest'

import { filenameFor } from '@/lib/download'

/**
 * The name a downloaded shot lands under.
 *
 * Derived from the prompt, so a folder of downloads is readable — which means
 * it has to survive prompts that are punctuation, emoji or empty.
 */
describe('filenameFor', () => {
  it('slugs the prompt and keeps the real extension', () => {
    expect(filenameFor('https://cdn.test/a/b.mp4', 'A lighthouse in a storm')).toBe(
      'a-lighthouse-in-a-storm.mp4',
    )
  })

  it('ignores a query string when reading the extension', () => {
    expect(filenameFor('https://cdn.test/a/b.webm?token=abc', 'Orbit')).toBe('orbit.webm')
  })

  it('falls back when the URL carries no usable extension', () => {
    expect(filenameFor('https://cdn.test/render/12345', 'Orbit')).toBe('orbit.png')
    expect(filenameFor('https://cdn.test/render/12345', 'Orbit', 'mp4')).toBe('orbit.mp4')
  })

  it('never produces a bare extension from an unusable prompt', () => {
    expect(filenameFor('https://cdn.test/a.png', '   ')).toBe('kinetic-shot.png')
    expect(filenameFor('https://cdn.test/a.png', '!!!')).toBe('kinetic-shot.png')
  })

  it('trims the slug rather than writing a 200-character filename', () => {
    const name = filenameFor('https://cdn.test/a.png', 'word '.repeat(50))
    expect(name.length).toBeLessThanOrEqual(53)
    expect(name.startsWith('-')).toBe(false)
    expect(name).not.toContain('-.')
  })
})
