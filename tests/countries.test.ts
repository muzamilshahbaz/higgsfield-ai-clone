import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COUNTRIES,
  countryName,
  flagSrc,
  getCountry,
  isCountryCode,
  matchesCountry,
} from '@/lib/countries'
import { checkoutSchema } from '@/lib/validation/billing'

/**
 * The country list.
 *
 * The thing worth pinning is that this is the *whole* list and not a
 * convenience subset. The previous implementation hard-coded fifteen
 * countries, which silently meant a customer in the sixteenth could not
 * complete checkout — a failure nobody would report as a bug, they would just
 * leave.
 *
 * The flag assertions check real files on disk, because a flag path that is
 * right in principle and 404s in practice looks identical in a code review.
 */

describe('the catalogue', () => {
  it('covers the whole of ISO 3166-1, not a shortlist', () => {
    // ~250 assigned alpha-2 codes; anything near fifteen is a hard-coded list.
    expect(COUNTRIES.length).toBeGreaterThan(200)
  })

  it('includes countries the old fifteen-entry list left out', () => {
    for (const code of ['BR', 'NG', 'ZA', 'MX', 'PL', 'VN', 'AR', 'KE']) {
      expect(isCountryCode(code), code).toBe(true)
    }
  })

  it('keeps the ones the old list had', () => {
    for (const code of ['GB', 'US', 'CA', 'AU', 'IE', 'DE', 'FR', 'IN', 'JP', 'SG']) {
      expect(isCountryCode(code), code).toBe(true)
    }
  })

  it('is sorted by display name', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('has a unique, two-letter uppercase code for every entry', () => {
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('gives every country a non-empty name', () => {
    for (const c of COUNTRIES) expect(c.name.trim().length).toBeGreaterThan(0)
  })
})

describe('isCountryCode', () => {
  it('accepts a real code in either case', () => {
    expect(isCountryCode('GB')).toBe(true)
    expect(isCountryCode('gb')).toBe(true)
  })

  it('rejects codes that are not assigned, and non-strings', () => {
    for (const bad of ['ZZ', 'XX', 'GBR', 'G', '', null, undefined, 42, {}]) {
      expect(isCountryCode(bad)).toBe(false)
    }
  })
})

describe('lookups', () => {
  it('resolves a code to its country regardless of case', () => {
    expect(getCountry('gb')?.name).toBe('United Kingdom')
    expect(getCountry('GB')?.code).toBe('GB')
  })

  it('returns null rather than throwing on an unknown code', () => {
    expect(getCountry('ZZ')).toBeNull()
    expect(getCountry(null)).toBeNull()
  })

  it('falls back to the raw code so a renamed country never renders blank', () => {
    expect(countryName('GB')).toBe('United Kingdom')
    expect(countryName('ZZ')).toBe('ZZ')
    expect(countryName(null)).toBe('—')
  })
})

describe('search', () => {
  it('matches on the country name, case-insensitively', () => {
    const gb = getCountry('GB')!
    expect(matchesCountry(gb, 'united')).toBe(true)
    expect(matchesCountry(gb, 'KINGDOM')).toBe(true)
  })

  it('matches on the ISO code', () => {
    expect(matchesCountry(getCountry('DE')!, 'de')).toBe(true)
  })

  it('finds a country by the name people actually type', () => {
    // The whole reason the alias list is carried through from the package.
    expect(matchesCountry(getCountry('GB')!, 'UK')).toBe(true)
    expect(matchesCountry(getCountry('US')!, 'USA')).toBe(true)
    expect(matchesCountry(getCountry('US')!, 'America')).toBe(true)
  })

  it('matches everything on an empty query', () => {
    expect(matchesCountry(getCountry('FR')!, '')).toBe(true)
    expect(matchesCountry(getCountry('FR')!, '   ')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesCountry(getCountry('FR')!, 'zzzzz')).toBe(false)
  })
})

describe('flags', () => {
  it('builds a lowercase same-origin path', () => {
    expect(flagSrc('GB')).toBe('/flags/gb.svg')
    expect(flagSrc('us')).toBe('/flags/us.svg')
  })

  it('has a real file on disk for every country in the list', () => {
    // A missing flag is a broken image in a dropdown — invisible in review,
    // obvious to a user.
    const missing = COUNTRIES.filter(
      (c) => !existsSync(join(process.cwd(), 'public', 'flags', `${c.code.toLowerCase()}.svg`)),
    ).map((c) => `${c.code} (${c.name})`)

    expect(missing).toEqual([])
  })
})

describe('checkout accepts the full list', () => {
  const base = {
    planId: 'pro',
    cardholderName: 'Ada Lovelace',
    cardNumber: '4242 4242 4242 4242',
    expiry: '12/30',
    cvv: '123',
  }

  it('accepts a country the old hard-coded list would have rejected', () => {
    expect(checkoutSchema.safeParse({ ...base, billingCountry: 'BR' }).success).toBe(true)
    expect(checkoutSchema.safeParse({ ...base, billingCountry: 'NG' }).success).toBe(true)
  })

  it('normalises to uppercase, so `gb` and `GB` store one value', () => {
    const parsed = checkoutSchema.parse({ ...base, billingCountry: 'gb' })
    expect(parsed.billingCountry).toBe('GB')
  })

  it('still rejects a code that is not a country', () => {
    expect(checkoutSchema.safeParse({ ...base, billingCountry: 'ZZ' }).success).toBe(false)
    expect(checkoutSchema.safeParse({ ...base, billingCountry: '' }).success).toBe(false)
  })
})
