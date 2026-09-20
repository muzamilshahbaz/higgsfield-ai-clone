import 'server-only'

import {
  BRAND_LABELS,
  checkExpiry,
  detectBrand,
  expectedCvvLength,
  last4,
  normaliseCardNumber,
  passesLuhn,
  type CardBrand,
} from '@/lib/payments/card'

/**
 * A simulated payment gateway.
 *
 * This application takes no money. There is no acquirer, no PSP and no card
 * network behind this file — it is a believable stand-in so the subscription
 * flows can be built, demonstrated and tested end to end without anyone's
 * card being involved.
 *
 * It is written against the `PaymentGateway` interface below so that replacing
 * it with a real provider is a matter of writing a second implementation and
 * changing which one `getGateway()` returns. Nothing outside this folder knows
 * that payments are simulated: the service layer asks for a charge and gets a
 * result, exactly as it would from a real one.
 *
 * **The card number is never returned, logged, stored or transmitted.** It
 * enters `charge()`, is checked for shape, and what leaves is a brand and the
 * last four digits — the same thing a real receipt shows.
 */

export interface CardDetails {
  cardholderName: string
  /** Digits, possibly spaced. Consumed here and never passed on. */
  cardNumber: string
  /** `MM/YY`. */
  expiry: string
  cvv: string
  /** ISO 3166-1 alpha-2. */
  billingCountry: string
}

export interface ChargeRequest {
  amountPence: number
  currency: 'gbp'
  description: string
  card: CardDetails
}

export type DeclineCode =
  | 'card_declined'
  | 'insufficient_funds'
  | 'expired_card'
  | 'incorrect_cvc'
  | 'processing_error'
  | 'invalid_number'

/** The card, as a receipt may show it. Never the number itself. */
export interface CardSummary {
  brand: CardBrand
  brandLabel: string
  last4: string
}

/**
 * A decline carries the card summary too.
 *
 * Someone looking at a failed payment in their history wants to know *which*
 * card was declined — that is usually the whole question. Only an unreadable
 * number has no summary to give.
 */
export type ChargeResult =
  | ({ ok: true; /** A believable reference for the receipt. */ reference: string } & CardSummary)
  | ({ ok: false; code: DeclineCode; message: string } & Partial<CardSummary>)

export interface PaymentGateway {
  readonly simulated: boolean
  charge(request: ChargeRequest): Promise<ChargeResult>
}

/**
 * Cards that deliberately fail, so error states are testable.
 *
 * These are the numbers the major PSPs reserve for exactly this, which means
 * anyone who has integrated payments before will already know them. Each one
 * passes Luhn — the decline is a decision, not a validation failure, which is
 * the distinction being tested.
 */
const DECLINE_CARDS: Record<string, { code: DeclineCode; message: string }> = {
  '4000000000000002': {
    // Phrased so it does not repeat the "Payment declined" heading above it.
    code: 'card_declined',
    message: 'Your bank refused this payment.',
  },
  '4000000000009995': {
    code: 'insufficient_funds',
    message: 'Your card has insufficient funds.',
  },
  '4000000000000069': {
    code: 'expired_card',
    message: 'Your card has expired.',
  },
  '4000000000000127': {
    code: 'incorrect_cvc',
    message: "Your card's security code is incorrect.",
  },
  '4000000000000119': {
    code: 'processing_error',
    message: 'An error occurred while processing your card. Try again.',
  },
}

/** Published in the UI so a demo has something known-good to type. */
export const DEMO_SUCCESS_CARD = '4242 4242 4242 4242'
export const DEMO_DECLINE_CARD = '4000 0000 0000 0002'

const MIN_LATENCY_MS = 900
const MAX_LATENCY_MS = 2_100

function reference(): string {
  // Shaped like a payment reference so receipts look like receipts.
  const rand = Math.random().toString(36).slice(2, 12)
  return `dm_${Date.now().toString(36)}${rand}`.slice(0, 26)
}

class DemoGateway implements PaymentGateway {
  readonly simulated = true

  async charge({ amountPence, card }: ChargeRequest): Promise<ChargeResult> {
    const digits = normaliseCardNumber(card.cardNumber)
    const brand = detectBrand(digits)

    // Shape first, and before any latency: a malformed card should fail the
    // way a real form does, immediately, not after a fake two-second wait.
    if (!passesLuhn(digits)) {
      // No summary: a number that fails its checksum is not a card to name.
      return {
        ok: false,
        code: 'invalid_number',
        message: 'That card number is not valid. Check the digits and try again.',
      }
    }

    const summary: CardSummary = {
      brand,
      brandLabel: BRAND_LABELS[brand],
      last4: last4(digits),
    }
    if (card.cvv.replace(/\D/g, '').length !== expectedCvvLength(brand)) {
      return {
        ok: false,
        ...summary,
        code: 'incorrect_cvc',
        message: `The security code should be ${expectedCvvLength(brand)} digits.`,
      }
    }
    if (!checkExpiry(card.expiry).ok) {
      return { ok: false, ...summary, code: 'expired_card', message: 'That expiry date is not valid.' }
    }
    if (amountPence <= 0) {
      return { ok: false, ...summary, code: 'processing_error', message: 'Nothing to charge.' }
    }

    // Everything past this point is the part a real network would do, so it is
    // the part worth making feel real.
    await latency()

    const decline = DECLINE_CARDS[digits]
    if (decline) return { ok: false, ...summary, ...decline }

    return { ok: true, reference: reference(), ...summary }
  }
}

function latency(): Promise<void> {
  const ms = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const gateway: PaymentGateway = new DemoGateway()

/**
 * The gateway the application uses.
 *
 * The one place to change when a real provider arrives. Everything upstream
 * depends on the interface, not on this returning a demo implementation.
 */
export function getGateway(): PaymentGateway {
  return gateway
}
