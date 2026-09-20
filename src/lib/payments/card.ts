/**
 * Card *format* validation, for a demo checkout.
 *
 * This validates shape and nothing else. It cannot tell you whether a card
 * exists, has funds, or belongs to the person typing — only a real acquirer
 * can, and this application deliberately never talks to one.
 *
 * Shared by the client form and the server action on purpose: the form gives
 * immediate feedback, the action re-checks because a client-side check is a
 * convenience and never a guarantee.
 *
 * Nothing here logs, stores or transmits a card number.
 */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown'

/** Digits only, so spacing and dashes never change the answer. */
export function normaliseCardNumber(input: string): string {
  return input.replace(/\D/g, '')
}

/** `4242 4242 4242 4242` — grouped as the brand expects, for display only. */
export function formatCardNumber(input: string): string {
  const digits = normaliseCardNumber(input).slice(0, 19)
  // Amex is 4-6-5 rather than groups of four, and getting it wrong looks wrong.
  if (detectBrand(digits) === 'amex') {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ')
  }
  return (digits.match(/.{1,4}/g) ?? []).join(' ')
}

export function detectBrand(input: string): CardBrand {
  const d = normaliseCardNumber(input)
  if (/^4/.test(d)) return 'visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'mastercard'
  if (/^3[47]/.test(d)) return 'amex'
  if (/^6(?:011|5)/.test(d)) return 'discover'
  return 'unknown'
}

export const BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  unknown: 'Card',
}

/**
 * The Luhn checksum.
 *
 * Every real card number satisfies it, and so do the well-known test numbers —
 * which is why `4242 4242 4242 4242` works here and `1234 5678 9012 3456` does
 * not. It is a typo check, not an authorisation.
 */
export function passesLuhn(input: string): boolean {
  const d = normaliseCardNumber(input)
  if (d.length < 12) return false

  let sum = 0
  let double = false
  for (let i = d.length - 1; i >= 0; i--) {
    let digit = d.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

/** `MM/YY`, as typed, with the slash inserted for the user. */
export function formatExpiry(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

export interface ExpiryCheck {
  ok: boolean
  reason?: 'format' | 'month' | 'past'
}

/**
 * Expiry, against the current month.
 *
 * A card expiring this month is still valid this month, so the comparison is
 * "end of that month" rather than "the first of it".
 */
export function checkExpiry(input: string, now = new Date()): ExpiryCheck {
  const match = /^(\d{2})\s*\/?\s*(\d{2})$/.exec(input.trim())
  if (!match) return { ok: false, reason: 'format' }

  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  if (month < 1 || month > 12) return { ok: false, reason: 'month' }

  // Day 0 of the next month is the last day of this one.
  const expiresAt = new Date(year, month, 0, 23, 59, 59, 999)
  if (expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'past' }

  return { ok: true }
}

/** Amex uses four digits, everyone else three. */
export function expectedCvvLength(brand: CardBrand): number {
  return brand === 'amex' ? 4 : 3
}

/** The last four digits, for a receipt. Never the whole number. */
export function last4(input: string): string {
  return normaliseCardNumber(input).slice(-4)
}
