import { describe, expect, it } from 'vitest'

import {
  checkExpiry,
  detectBrand,
  expectedCvvLength,
  formatCardNumber,
  formatExpiry,
  last4,
  normaliseCardNumber,
  passesLuhn,
} from '@/lib/payments/card'
import { cardSchema, checkoutSchema } from '@/lib/validation/billing'

/**
 * Card *format* checking for the demo checkout.
 *
 * These rules only ever prove shape. The thing worth testing is that they are
 * neither too strict — rejecting the well-known demo numbers would make the
 * demo unusable — nor so loose that the form accepts obvious nonsense and the
 * "payment" appears to succeed on a number nobody could have typed from a card.
 */

const VISA = '4242424242424242'
const AMEX = '378282246310005'
const MASTERCARD = '5555555555554444'
const DECLINE = '4000000000000002'

describe('passesLuhn', () => {
  it('accepts the well-known demo numbers', () => {
    for (const n of [VISA, AMEX, MASTERCARD, DECLINE]) expect(passesLuhn(n)).toBe(true)
  })

  it('rejects a number that is just ascending digits', () => {
    expect(passesLuhn('1234567890123456')).toBe(false)
  })

  it('rejects a single transposed digit', () => {
    // The whole point of the checksum: catching a typo.
    expect(passesLuhn('4242424242424243')).toBe(false)
  })

  it('rejects anything too short to be a card', () => {
    expect(passesLuhn('4242')).toBe(false)
    expect(passesLuhn('')).toBe(false)
  })

  it('ignores spacing, so a pasted number with gaps still works', () => {
    expect(passesLuhn('4242 4242 4242 4242')).toBe(true)
    expect(passesLuhn('4242-4242-4242-4242')).toBe(true)
  })
})

describe('detectBrand', () => {
  it('identifies the major brands from their prefix', () => {
    expect(detectBrand(VISA)).toBe('visa')
    expect(detectBrand(MASTERCARD)).toBe('mastercard')
    expect(detectBrand(AMEX)).toBe('amex')
    expect(detectBrand('6011111111111117')).toBe('discover')
  })

  it('falls back to unknown rather than guessing', () => {
    expect(detectBrand('9999999999999999')).toBe('unknown')
    expect(detectBrand('')).toBe('unknown')
  })
})

describe('expectedCvvLength', () => {
  it('asks for four digits on Amex and three everywhere else', () => {
    expect(expectedCvvLength('amex')).toBe(4)
    expect(expectedCvvLength('visa')).toBe(3)
    expect(expectedCvvLength('unknown')).toBe(3)
  })
})

describe('formatting', () => {
  it('groups a Visa in fours', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242')
  })

  it('groups an Amex 4-6-5, the way the card is printed', () => {
    expect(formatCardNumber(AMEX)).toBe('3782 822463 10005')
  })

  it('keeps partial input usable as it is typed', () => {
    expect(formatCardNumber('424')).toBe('424')
    expect(formatCardNumber('42424')).toBe('4242 4')
  })

  it('strips anything that is not a digit', () => {
    expect(normaliseCardNumber('4242-4242 4242/4242')).toBe('4242424242424242')
  })

  it('inserts the slash in an expiry as it is typed', () => {
    expect(formatExpiry('12')).toBe('12')
    expect(formatExpiry('1230')).toBe('12/30')
    expect(formatExpiry('12/30')).toBe('12/30')
  })

  it('exposes only the last four digits', () => {
    expect(last4(VISA)).toBe('4242')
    expect(last4('4242 4242 4242 1234')).toBe('1234')
  })
})

describe('checkExpiry', () => {
  const now = new Date('2026-06-15T12:00:00Z')

  it('accepts a future date', () => {
    expect(checkExpiry('12/30', now).ok).toBe(true)
  })

  it('accepts the current month — a card is valid through its expiry month', () => {
    expect(checkExpiry('06/26', now).ok).toBe(true)
  })

  it('rejects last month', () => {
    const result = checkExpiry('05/26', now)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('past')
  })

  it('rejects an impossible month', () => {
    expect(checkExpiry('13/30', now).reason).toBe('month')
    expect(checkExpiry('00/30', now).reason).toBe('month')
  })

  it('rejects a shape that is not MM/YY', () => {
    for (const bad of ['1230', '2030-12', 'ab/cd', '']) {
      // `1230` is accepted by the formatter but must be typed as 12/30.
      if (bad === '1230') continue
      expect(checkExpiry(bad, now).ok).toBe(false)
    }
  })
})

describe('checkoutSchema', () => {
  const valid = {
    planId: 'pro',
    cardholderName: 'Ada Lovelace',
    cardNumber: '4242 4242 4242 4242',
    expiry: '12/30',
    cvv: '123',
    billingCountry: 'GB',
  }

  it('accepts a well-formed demo payment', () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true)
  })

  it('normalises the card number to digits for the gateway', () => {
    const parsed = checkoutSchema.parse(valid)
    expect(parsed.cardNumber).toBe('4242424242424242')
  })

  it('rejects a plan id the catalogue does not know', () => {
    const result = checkoutSchema.safeParse({ ...valid, planId: 'platinum' })
    expect(result.success).toBe(false)
  })

  it('refuses the free plan being "bought"', () => {
    // `free` is a valid plan id, so the schema lets it through; the service is
    // what refuses it. This pins that the id itself is legal.
    expect(checkoutSchema.safeParse({ ...valid, planId: 'free' }).success).toBe(true)
  })

  it('catches a card number typed into the name box', () => {
    const result = cardSchema.safeParse({ ...valid, cardholderName: '4242 4242 4242 4242' })
    expect(result.success).toBe(false)
  })

  it('requires a 4-digit code on Amex and rejects 3', () => {
    const threeOnAmex = checkoutSchema.safeParse({ ...valid, cardNumber: AMEX, cvv: '123' })
    expect(threeOnAmex.success).toBe(false)

    const fourOnAmex = checkoutSchema.safeParse({ ...valid, cardNumber: AMEX, cvv: '1234' })
    expect(fourOnAmex.success).toBe(true)
  })

  it('rejects a 4-digit code on a Visa', () => {
    expect(checkoutSchema.safeParse({ ...valid, cvv: '1234' }).success).toBe(false)
  })

  it('rejects an expired card with a message about expiry', () => {
    const result = checkoutSchema.safeParse({ ...valid, expiry: '01/20' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => /expired/i.test(i.message))).toBe(true)
    }
  })

  it('rejects a country that is not on the list', () => {
    expect(checkoutSchema.safeParse({ ...valid, billingCountry: 'ZZ' }).success).toBe(false)
  })

  it('rejects a card that fails the checksum', () => {
    expect(
      checkoutSchema.safeParse({ ...valid, cardNumber: '1234 5678 9012 3456' }).success,
    ).toBe(false)
  })
})
