import { countries as RAW } from 'countries-list'

/**
 * Countries — one source of truth, derived from `countries-list`.
 *
 * Nothing in this app should hand-maintain a country list again. The previous
 * one had fifteen entries chosen by whoever wrote the form, which quietly
 * meant anyone outside them could not complete checkout.
 *
 * `countries-list` is ISO 3166-1: the key is the alpha-2 code, which is what
 * gets stored. The display name and the flag are derived from it, so the
 * database holds `GB` and the UI decides how to render that.
 *
 * Not `server-only` — the checkout form needs it in the browser. It is a
 * static list of public facts.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, uppercase. This is the value that is stored. */
  code: string
  name: string
  /**
   * Alternative names the package ships — "UK", "Britain", "USA", "America".
   * Searching for "UK" finding nothing is the kind of small failure that makes
   * a country picker feel broken.
   */
  aliases: string[]
}

export const COUNTRIES: Country[] = Object.entries(RAW)
  .map(([code, data]) => ({
    code,
    name: data.name,
    aliases: 'alias' in data && Array.isArray(data.alias) ? [...data.alias] : [],
  }))
  // Sorted by name with `localeCompare`, so accented names land where a reader
  // expects rather than where their code point falls.
  .sort((a, b) => a.name.localeCompare(b.name))

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && BY_CODE.has(value.toUpperCase())
}

export function getCountry(code: string | null | undefined): Country | null {
  if (!code) return null
  return BY_CODE.get(code.toUpperCase()) ?? null
}

/** The display name for a stored code, falling back to the code itself. */
export function countryName(code: string | null | undefined): string {
  return getCountry(code)?.name ?? code ?? '—'
}

/**
 * The flag for a code.
 *
 * A same-origin SVG rather than an emoji: Windows ships no flag glyphs, so
 * `🇬🇧` renders there as the letters "GB" and the picker looks broken to a
 * large share of users. Files are produced by `scripts/sync-flags.mjs`.
 */
export function flagSrc(code: string): string {
  return `/flags/${code.toLowerCase()}.svg`
}

/** Free-text match over the name, the code and the package's aliases. */
export function matchesCountry(country: Country, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (country.code.toLowerCase().startsWith(q)) return true
  if (country.name.toLowerCase().includes(q)) return true
  return country.aliases.some((a) => a.toLowerCase().includes(q))
}
