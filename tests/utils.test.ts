import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  aspectStyle,
  cn,
  formatBytes,
  formatDuration,
  formatRelativeTime,
  newIdempotencyKey,
  truncate,
} from '@/lib/utils'
import { isTerminal, TERMINAL_STATUSES } from '@/types/database'
import type { GenerationStatus } from '@/types/database'

afterEach(() => {
  vi.useRealTimers()
})

describe('cn', () => {
  it('merges conflicting tailwind classes, last one winning', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('drops falsy values', () => {
    expect(cn('flex', false && 'hidden', undefined, null, 'gap-2')).toBe('flex gap-2')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-20T12:00:00.000Z')

  function ago(ms: number) {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    return formatRelativeTime(new Date(now.getTime() - ms))
  }

  it('collapses the last minute into "just now"', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(44_000)).toBe('just now')
  })

  it('uses words for a single minute', () => {
    expect(ago(60_000)).toBe('a minute ago')
  })

  it('counts minutes, then hours, then days', () => {
    expect(ago(10 * 60_000)).toBe('10m ago')
    expect(ago(3 * 3_600_000)).toBe('3h ago')
    expect(ago(3 * 86_400_000)).toBe('3d ago')
  })

  it('falls back to a date beyond a week', () => {
    expect(ago(30 * 86_400_000)).not.toMatch(/ago/)
  })

  it('accepts an ISO string, the shape every row carries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(formatRelativeTime('2026-09-20T11:00:00.000Z')).toBe('1h ago')
  })
})

describe('formatDuration', () => {
  it('shows an em dash for nothing to show', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
  })

  it('shows plain seconds under a minute', () => {
    expect(formatDuration(5_000)).toBe('5s')
    expect(formatDuration(59_000)).toBe('59s')
  })

  it('zero-pads the seconds past a minute', () => {
    expect(formatDuration(60_000)).toBe('1:00')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(125_000)).toBe('2:05')
  })
})

describe('formatBytes', () => {
  it('shows an em dash for nothing to show', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(0)).toBe('—')
  })

  it('scales through the units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.0 MB')
    expect(formatBytes(1024 ** 3 * 2)).toBe('2.0 GB')
  })

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(formatBytes(1024 * 20)).toBe('20 KB')
  })

  it('clamps at GB rather than emitting undefined', () => {
    expect(formatBytes(1024 ** 5)).toMatch(/GB$/)
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('never exceeds the requested length', () => {
    const out = truncate('a'.repeat(200), 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })

  it('does not leave a dangling space before the ellipsis', () => {
    expect(truncate('hello world again', 12)).toBe('hello world…')
  })
})

describe('newIdempotencyKey', () => {
  it('is unique across calls, so two clicks are two keys', () => {
    const keys = new Set(Array.from({ length: 500 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(500)
  })

  it('falls back to a usable key when crypto.randomUUID is unavailable', () => {
    const original = globalThis.crypto
    // Some runtimes (older Node, certain edge sandboxes) have no randomUUID.
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    try {
      const key = newIdempotencyKey()
      expect(key).toMatch(/^k_/)
      expect(key.length).toBeGreaterThan(8)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})

describe('isTerminal', () => {
  it('treats only finished jobs as terminal', () => {
    expect(isTerminal('succeeded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('canceled')).toBe(true)
  })

  it('keeps in-flight jobs pollable, so the ticker keeps running', () => {
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('running')).toBe(false)
  })

  it('classifies every status in the enum exactly once', () => {
    const all: GenerationStatus[] = ['queued', 'running', 'succeeded', 'failed', 'canceled']
    const terminal = all.filter(isTerminal)
    expect(terminal.sort()).toEqual([...TERMINAL_STATUSES].sort())
  })
})

describe('aspectStyle', () => {
  it('turns a ratio string into a CSS aspect-ratio', () => {
    expect(aspectStyle('16:9')).toEqual({ aspectRatio: '16 / 9' })
    expect(aspectStyle('9:16')).toEqual({ aspectRatio: '9 / 16' })
    expect(aspectStyle('1:1')).toEqual({ aspectRatio: '1 / 1' })
  })

  it('falls back rather than emitting an invalid rule', () => {
    expect(aspectStyle('')).toEqual({ aspectRatio: '16 / 9' })
    expect(aspectStyle('wide')).toEqual({ aspectRatio: '16 / 9' })
    expect(aspectStyle('16:0')).toEqual({ aspectRatio: '16 / 9' })
  })
})
