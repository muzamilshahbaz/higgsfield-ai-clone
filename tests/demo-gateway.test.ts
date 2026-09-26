import { describe, expect, it } from 'vitest'

import {
  DEMO_DECLINE_CARD,
  DEMO_SUCCESS_CARD,
  getGateway,
  type CardDetails,
} from '@/lib/payments/demo-gateway'

/**
 * The simulated gateway.
 *
 * Two things matter here and neither is the pretend money. First, that the
 * card number never comes back out — a gateway that echoed it would put it in
 * a log or a database the first time somebody stored a result. Second, that
 * failure is reachable and distinguishable, because an error state nobody can
 * trigger is an error state nobody has tested.
 */

const gateway = getGateway()

function card(over: Partial<CardDetails> = {}): CardDetails {
  return {
    cardholderName: 'Ada Lovelace',
    cardNumber: DEMO_SUCCESS_CARD,
    expiry: '12/30',
    cvv: '123',
    billingCountry: 'GB',
    ...over,
  }
}

function charge(over: Partial<CardDetails> = {}, amountMinor = 2400) {
  return gateway.charge({
    amountMinor,
    currency: 'usd',
    description: 'Kinetic Pro — one month',
    card: card(over),
  })
}

describe('the demo gateway announces itself', () => {
  it('is marked as simulated, so nothing can mistake it for a real provider', () => {
    expect(gateway.simulated).toBe(true)
  })
})

describe('successful charges', () => {
  it('approves the published demo card', async () => {
    const result = await charge()
    expect(result.ok).toBe(true)
  })

  it('returns a brand and last four, and never the card number', async () => {
    const result = await charge()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.last4).toBe('4242')
    expect(result.brand).toBe('visa')
    expect(result.brandLabel).toBe('Visa')

    // The whole point: nothing in the result can be turned back into a PAN.
    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain('4242424242424242')
    expect(serialised).not.toContain('123') // the CVV
  })

  it('issues a distinct reference per charge', async () => {
    const [a, b] = await Promise.all([charge(), charge()])
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(a.reference).not.toBe(b.reference)
  })
})

describe('declines are reachable and specific', () => {
  it('declines the published decline card', async () => {
    const result = await charge({ cardNumber: DEMO_DECLINE_CARD })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('card_declined')
      // The code is the contract; the wording belongs to the UI and is free to
      // change. Asserting on copy here just breaks the suite on a rewrite.
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it('names the card that was declined, because that is the whole question', async () => {
    const result = await charge({ cardNumber: DEMO_DECLINE_CARD })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.last4).toBe('0002')
      expect(result.brandLabel).toBe('Visa')
      // Still never the number itself.
      expect(JSON.stringify(result)).not.toContain('4000000000000002')
    }
  })

  it('gives no card summary when the number was never readable', async () => {
    const result = await charge({ cardNumber: '1234 5678 9012 3456' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.last4).toBeUndefined()
  })

  it('reports insufficient funds separately from a flat decline', async () => {
    const result = await charge({ cardNumber: '4000 0000 0000 9995' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('insufficient_funds')
  })

  it('declines a card that fails the checksum before any latency', async () => {
    const started = Date.now()
    const result = await charge({ cardNumber: '1234 5678 9012 3456' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_number')
    // A malformed card should fail like a form, not after a fake network wait.
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('rejects a security code of the wrong length', async () => {
    const result = await charge({ cvv: '12' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('incorrect_cvc')
  })

  it('rejects an expired card', async () => {
    const result = await charge({ expiry: '01/20' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('expired_card')
  })

  it('refuses to charge nothing', async () => {
    const result = await charge({}, 0)
    expect(result.ok).toBe(false)
  })
})

describe('latency', () => {
  it('takes a believable moment on a real authorisation', async () => {
    const started = Date.now()
    await charge()
    // Enough to show a loading state; the UI depends on it being non-instant.
    expect(Date.now() - started).toBeGreaterThanOrEqual(800)
  })
})
