import { describe, expect, it } from 'vitest'

import {
  asBoolean,
  asInstant,
  asJson,
  asNullableString,
  asNumber,
  asString,
  asStringArray,
  emptyValue,
  initialValues,
  toLocalInput,
  type FieldSpec,
} from '@/components/admin/form-spec'
import { diffOf, redact } from '@/lib/admin/audit'
import { FEATURE_SPAN_VALUES, isIconName, resolveIcon } from '@/lib/admin/icons'
import {
  configBoolean,
  configNumber,
  configString,
  DEFAULT_CAPABILITIES,
  DEFAULT_FAQ_ITEMS,
  DEFAULT_FEATURES,
  DEFAULT_NAV,
  DEFAULT_OVERVIEW,
  DEFAULT_STATS,
  DEFAULT_TESTIMONIALS,
  DEFAULT_WORKFLOW,
  emptySection,
  isSectionKey,
  KNOWN_SECTIONS,
  resolveNavHref,
  statValue,
  type StatCell,
  type StatSources,
} from '@/lib/cms/content'
import {
  DEFAULT_SETTINGS,
  readBoolean,
  readNumber,
  readOptionalString,
  readString,
  readStringArray,
  resolveSettings,
  type SettingBag,
} from '@/lib/cms/settings'
import { FLAG_DEFAULTS } from '@/lib/flags'

/**
 * The CMS read layer.
 *
 * Everything here is a fallback path, and a fallback is the code least likely to be exercised by
 * hand and most likely to matter. The contract being tested is one sentence: an unreachable,
 * unseeded or malformed database must leave the site looking exactly as it shipped.
 */

describe('settings coercion never produces a broken value', () => {
  const bag = (entries: Record<string, unknown>): SettingBag =>
    new Map(Object.entries(entries)) as SettingBag

  it('falls back on a missing key', () => {
    expect(readString(bag({}), 'site.name', 'Kinetic')).toBe('Kinetic')
    expect(readNumber(bag({}), 'limits.x', 42)).toBe(42)
    expect(readBoolean(bag({}), 'seo.robots_index', true)).toBe(true)
    expect(readStringArray(bag({}), 'seo.keywords', ['a'])).toEqual(['a'])
  })

  it('falls back on a value of the wrong type', () => {
    expect(readString(bag({ 'site.name': 12 }), 'site.name', 'Kinetic')).toBe('Kinetic')
    expect(readString(bag({ 'site.name': null }), 'site.name', 'Kinetic')).toBe('Kinetic')
    expect(readNumber(bag({ n: {} }), 'n', 5)).toBe(5)
    expect(readBoolean(bag({ b: 'maybe' }), 'b', false)).toBe(false)
  })

  it('falls back on an empty or whitespace string', () => {
    expect(readString(bag({ x: '' }), 'x', 'default')).toBe('default')
    expect(readString(bag({ x: '   ' }), 'x', 'default')).toBe('default')
  })

  it('accepts a number typed into a text field', () => {
    // The realistic failure: a form posts "1200" and the limit silently stays at its default.
    expect(readNumber(bag({ n: '1200' }), 'n', 0)).toBe(1200)
  })

  it('refuses a non-finite number rather than storing NaN', () => {
    expect(readNumber(bag({ n: Number.NaN }), 'n', 7)).toBe(7)
    expect(readNumber(bag({ n: 'twelve' }), 'n', 7)).toBe(7)
  })

  it('distinguishes "not set" from "explicitly null"', () => {
    // A nullable setting has to be able to hold null. Without this, clearing the OG image would
    // silently restore whatever the fallback was.
    expect(readOptionalString(bag({}), 'seo.og_image_url', 'fallback')).toBe('fallback')
    expect(readOptionalString(bag({ 'seo.og_image_url': null }), 'seo.og_image_url', 'fallback')).toBe(
      null,
    )
  })

  it('accepts a comma-separated string for a list field', () => {
    expect(readStringArray(bag({ k: 'ai, video , open' }), 'k', [])).toEqual(['ai', 'video', 'open'])
  })

  it('drops non-strings out of a list', () => {
    expect(readStringArray(bag({ k: ['a', 3, null, 'b', ''] }), 'k', [])).toEqual(['a', 'b'])
  })
})

describe('resolveSettings', () => {
  it('returns the shipped defaults for an empty database', () => {
    expect(resolveSettings(new Map())).toEqual(DEFAULT_SETTINGS)
  })

  it('overrides only what is present', () => {
    const resolved = resolveSettings(new Map([['site.name', 'Aperture']]) as SettingBag)
    expect(resolved.site.name).toBe('Aperture')
    expect(resolved.site.tagline).toBe(DEFAULT_SETTINGS.site.tagline)
    expect(resolved.theme.colorPrimary).toBe(DEFAULT_SETTINGS.theme.colorPrimary)
  })

  it('resolves an unknown colour mode to dark rather than a half-styled page', () => {
    const resolved = resolveSettings(new Map([['theme.mode', 'sepia']]) as SettingBag)
    expect(resolved.theme.mode).toBe('dark')
  })

  it('accepts light as a stored value, since the admin form offers it', () => {
    const resolved = resolveSettings(new Map([['theme.mode', 'light']]) as SettingBag)
    expect(resolved.theme.mode).toBe('light')
  })
})

describe('feature flags fail in the safe direction', () => {
  it('defaults every surface on', () => {
    for (const [key, value] of Object.entries(FLAG_DEFAULTS)) {
      if (key === 'maintenance_mode') continue
      expect(value, `${key} should default on`).toBe(true)
    }
  })

  it('defaults maintenance mode off', () => {
    // The one that fails closed. Failing open on a kill switch would take the studio down on a
    // transient read error.
    expect(FLAG_DEFAULTS.maintenance_mode).toBe(false)
  })
})

describe('landing content defaults', () => {
  it('knows every band the page can render', () => {
    expect(KNOWN_SECTIONS).toContain('hero')
    expect(KNOWN_SECTIONS).toContain('pricing')
    expect(isSectionKey('hero')).toBe(true)
    expect(isSectionKey('newsletter')).toBe(false)
  })

  it('ships a non-empty default for every band that has content', () => {
    expect(DEFAULT_FEATURES.length).toBeGreaterThan(0)
    expect(DEFAULT_OVERVIEW.length).toBeGreaterThan(0)
    expect(DEFAULT_CAPABILITIES.length).toBeGreaterThan(0)
    expect(DEFAULT_STATS.length).toBeGreaterThan(0)
    expect(DEFAULT_FAQ_ITEMS.length).toBeGreaterThan(0)
    expect(DEFAULT_WORKFLOW.length).toBeGreaterThan(0)
  })

  it('ships no default testimonials', () => {
    // The page does not invent social proof. A seeded quote would be a fabricated one.
    expect(DEFAULT_TESTIMONIALS).toEqual([])
  })

  it('gives every default a stable id, so React keys behave the same either way', () => {
    const ids = [...DEFAULT_FEATURES, ...DEFAULT_OVERVIEW, ...DEFAULT_CAPABILITIES].map(
      (card) => card.id,
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tags every capability card with a real generation task', () => {
    // `href` is the join to the registry. A card with a bad task renders without its numbers.
    for (const card of DEFAULT_CAPABILITIES) {
      expect(['text_to_image', 'image_to_video', 'text_to_video']).toContain(card.href)
    }
  })

  it('gives every default feature card a span the grid can use', () => {
    for (const card of DEFAULT_FEATURES) {
      expect(FEATURE_SPAN_VALUES).toContain(card.span)
    }
  })

  it('returns a usable stand-in for a section with no row', () => {
    const section = emptySection('faq')
    expect(section.key).toBe('faq')
    expect(section.isVisible).toBe(true)
    expect(section.config).toEqual({})
    expect(section.title).toBeNull()
  })
})

describe('section config readers', () => {
  it('fall back on a missing or wrong-typed key', () => {
    expect(configString({}, 'highlight', 'x')).toBe('x')
    expect(configString({ highlight: 12 }, 'highlight')).toBeNull()
    expect(configBoolean({ tinted: 'yes' }, 'tinted', false)).toBe(false)
    expect(configNumber({ limit: '8' }, 'limit', 4)).toBe(4)
  })

  it('read a correct value through', () => {
    expect(configString({ highlight: 'stills move' }, 'highlight')).toBe('stills move')
    expect(configBoolean({ tinted: true }, 'tinted', false)).toBe(true)
    expect(configNumber({ limit: 12 }, 'limit', 4)).toBe(12)
  })
})

describe('statValue', () => {
  const sources: StatSources = {
    models: 10,
    presets: 36,
    providers: 3,
    signupCredits: 200,
    creators: 0,
    projects: 9,
    assets: 23,
    countries: 0,
    publicGenerations: 1,
  }

  const cell = (over: Partial<StatCell>): StatCell => ({
    id: 'x',
    key: 'x',
    label: 'X',
    detail: null,
    valueKind: 'literal',
    literalValue: null,
    prefix: null,
    suffix: null,
    sortOrder: 0,
    ...over,
  })

  it('prints a literal as typed', () => {
    expect(statValue(cell({ valueKind: 'literal', literalValue: '12k' }), sources)).toBe('12k')
  })

  it('returns null for a literal with nothing to print', () => {
    // The constraint prevents this, but a row written another way should not render a blank cell.
    expect(statValue(cell({ valueKind: 'literal', literalValue: '' }), sources)).toBeNull()
    expect(statValue(cell({ valueKind: 'literal', literalValue: null }), sources)).toBeNull()
  })

  it('counts a counted kind', () => {
    expect(statValue(cell({ valueKind: 'models' }), sources)).toBe('10')
    expect(statValue(cell({ valueKind: 'presets' }), sources)).toBe('36')
    expect(statValue(cell({ valueKind: 'signup_credits' }), sources)).toBe('200')
  })

  it('returns null rather than zero for a counted kind with nothing to count', () => {
    // "0 Creators" on a landing page is worse than three cells instead of four.
    expect(statValue(cell({ valueKind: 'creators' }), sources)).toBeNull()
    expect(statValue(cell({ valueKind: 'countries' }), sources)).toBeNull()
  })

  it('groups thousands, because a six-figure count is unreadable without it', () => {
    expect(statValue(cell({ valueKind: 'assets' }), { ...sources, assets: 12345 })).toBe('12,345')
  })
})

describe('nav href resolution', () => {
  const anchor = DEFAULT_NAV.header.find((item) => !item.isRoute)!
  const route = DEFAULT_NAV.header.find((item) => item.isRoute)!

  it('leaves a real route alone wherever it renders', () => {
    expect(resolveNavHref(route, true)).toBe(route.href)
    expect(resolveNavHref(route, false)).toBe(route.href)
  })

  it('rewrites an anchor when rendered off the landing page', () => {
    // The bug this exists for: a bare #pricing on /explore points at a section that is not there.
    expect(resolveNavHref(anchor, true)).toBe(anchor.href)
    expect(resolveNavHref(anchor, false)).toBe(`/${anchor.href}`)
  })

  it('leaves an external link alone', () => {
    const external = { ...anchor, isExternal: true, href: 'https://example.com' }
    expect(resolveNavHref(external, false)).toBe('https://example.com')
  })
})

describe('the icon allow-list', () => {
  it('accepts a name it knows', () => {
    expect(isIconName('Sparkles')).toBe(true)
  })

  it('refuses anything else, including module internals', () => {
    // The reason this is an allow-list: a text field that could name `default` would be choosing
    // which export gets rendered as a component.
    expect(isIconName('default')).toBe(false)
    expect(isIconName('createLucideIcon')).toBe(false)
    expect(isIconName('__proto__')).toBe(false)
    expect(isIconName('NotAnIcon')).toBe(false)
  })

  it('resolves an unknown name to the fallback rather than undefined', () => {
    // A lucide icon is a forwardRef object rather than a plain function, so the assertion is that
    // something renderable came back — never `undefined`, which would throw at render.
    expect(resolveIcon('NotAnIcon')).toBeTruthy()
    expect(resolveIcon(null)).toBeTruthy()
    expect(resolveIcon('__proto__')).toBeTruthy()
  })
})

describe('form value coercion', () => {
  it('gives each field kind a sensible empty value', () => {
    const specs: FieldSpec[] = [
      { kind: 'text', name: 't', label: 'T' },
      { kind: 'boolean', name: 'b', label: 'B' },
      { kind: 'number', name: 'n', label: 'N' },
      { kind: 'tags', name: 'g', label: 'G' },
      { kind: 'json', name: 'j', label: 'J' },
    ]
    expect(specs.map(emptyValue)).toEqual(['', false, 0, [], '{}'])
  })

  it('never leaves a boolean as an empty string, which would save as false by accident', () => {
    const values = initialValues([{ kind: 'boolean', name: 'is_visible', label: 'Visible' }])
    expect(values.is_visible).toBe(false)
  })

  it('prefers a provided initial value over the empty one', () => {
    const values = initialValues(
      [{ kind: 'text', name: 'title', label: 'Title' }],
      { title: 'Hello' },
    )
    expect(values.title).toBe('Hello')
  })

  it('treats null in an initial value as absent', () => {
    const values = initialValues([{ kind: 'text', name: 'detail', label: 'Detail' }], {
      detail: null,
    })
    expect(values.detail).toBe('')
  })

  it('trims strings and nullifies empties', () => {
    expect(asString('  hi  ')).toBe('hi')
    expect(asNullableString('   ')).toBeNull()
    expect(asNullableString(' x ')).toBe('x')
  })

  it('coerces numbers and booleans out of form strings', () => {
    expect(asNumber('42', 0)).toBe(42)
    expect(asNumber('', 7)).toBe(7)
    expect(asBoolean('true')).toBe(true)
    expect(asBoolean('false', true)).toBe(false)
  })

  it('splits a comma list into tags', () => {
    expect(asStringArray('a, b ,, c')).toEqual(['a', 'b', 'c'])
    expect(asStringArray(['x', 'y'])).toEqual(['x', 'y'])
  })

  it('reports unparseable JSON rather than silently saving an empty object', () => {
    expect(asJson('{"a":1}')).toEqual({ ok: true, data: { a: 1 } })
    expect(asJson('')).toEqual({ ok: true, data: {} })
    expect(asJson('{nope}')).toEqual({ ok: false })
  })

  it('round-trips a datetime through the local input format', () => {
    const iso = asInstant('2026-03-01T09:30')
    expect(iso).toBeTruthy()
    // Back to the same wall-clock text it came from, whatever the runner's zone is.
    expect(toLocalInput(iso)).toBe('2026-03-01T09:30')
  })

  it('treats an empty or unparseable datetime as null', () => {
    expect(asInstant('')).toBeNull()
    expect(asInstant('not a date')).toBeNull()
    expect(toLocalInput(null)).toBe('')
  })
})

describe('audit redaction', () => {
  it('replaces anything whose key looks like a secret', () => {
    const out = redact({
      apiKey: 'sk-live-abcdef',
      api_key: 'x',
      token: 'y',
      ciphertext: 'z',
      password: 'p',
      authorization: 'Bearer q',
      label: 'Production',
    }) as Record<string, unknown>

    expect(out.apiKey).toBe('[redacted]')
    expect(out.api_key).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.ciphertext).toBe('[redacted]')
    expect(out.password).toBe('[redacted]')
    expect(out.authorization).toBe('[redacted]')
    // Not a secret, and useful in a diff.
    expect(out.label).toBe('Production')
  })

  it('redacts inside a nested object', () => {
    const out = redact({ provider: { id: 'fal', secret: 'nope' } }) as Record<
      string,
      Record<string, unknown>
    >
    expect(out.provider?.secret).toBe('[redacted]')
    expect(out.provider?.id).toBe('fal')
  })

  it('truncates long strings rather than storing an essay', () => {
    const out = redact({ body: 'x'.repeat(900) }) as Record<string, string>
    const body = out.body ?? ''
    expect(body.length).toBeLessThan(520)
    expect(body.endsWith('…')).toBe(true)
  })

  it('stops at a depth limit rather than walking forever', () => {
    const deep = { a: { b: { c: { d: { e: 'bottom' } } } } }
    expect(JSON.stringify(redact(deep))).toContain('truncated')
  })

  it('drops values it cannot serialise', () => {
    const out = redact({ fn: () => null, big: 1 }) as Record<string, unknown>
    expect(out.fn).toBeNull()
    expect(out.big).toBe(1)
  })
})

describe('audit diffs record only what changed', () => {
  it('keeps the changed fields and drops the rest', () => {
    const { before, after } = diffOf(
      { title: 'Old', body: 'same', sort_order: 10 },
      { title: 'New', body: 'same', sort_order: 10 },
    )
    expect(before).toEqual({ title: 'Old' })
    expect(after).toEqual({ title: 'New' })
  })

  it('compares by value, so an equal array is not a change', () => {
    const { before, after } = diffOf({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })
    expect(before).toEqual({})
    expect(after).toEqual({})
  })

  it('records a whole row on a create and on a delete', () => {
    expect(diffOf(null, { title: 'New' })).toEqual({ before: null, after: { title: 'New' } })
    expect(diffOf({ title: 'Gone' }, null)).toEqual({ before: { title: 'Gone' }, after: null })
  })

  it('redacts a secret that changed', () => {
    const { before, after } = diffOf({ ciphertext: 'old' }, { ciphertext: 'new' })
    expect(before).toEqual({ ciphertext: '[redacted]' })
    expect(after).toEqual({ ciphertext: '[redacted]' })
  })
})
