import { z } from 'zod'

import {
  checkExpiry,
  detectBrand,
  expectedCvvLength,
  normaliseCardNumber,
  passesLuhn,
} from '@/lib/payments/card'
import { isPlanId } from '@/lib/plans'

/**
 * Checkout input.
 *
 * Format only. These rules can tell you that a card number has the wrong
 * number of digits or fails its checksum; they cannot tell you whether it
 * exists, and nothing in this application ever asks.
 *
 * Shared by the client form and the server action. The client version gives
 * feedback as you type; the action re-runs the same schema, because a check
 * that only happens in the browser is a suggestion.
 *
 * The messages are written to be read by the person typing — "Check the
 * digits" rather than "Luhn validation failed".
 */

export const COUNTRIES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
] as const

const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as readonly string[]

export const planIdSchema = z
  .string()
  .refine(isPlanId, { message: 'That is not a plan you can choose.' })

export const cardSchema = z.object({
  cardholderName: z
    .string()
    .trim()
    .min(2, 'Enter the name printed on the card.')
    .max(80, 'That name is too long.')
    // Digits in a cardholder name almost always mean the card number went in
    // the wrong box, which is worth catching before the card number field is.
    .refine((v) => !/\d/.test(v), { message: 'A cardholder name should not contain numbers.' }),

  cardNumber: z
    .string()
    .transform(normaliseCardNumber)
    .refine((v) => v.length > 0, { message: 'Enter a card number.' })
    .refine((v) => v.length >= 12 && v.length <= 19, {
      message: 'A card number is between 12 and 19 digits.',
    })
    .refine(passesLuhn, { message: 'That card number is not valid. Check the digits.' }),

  expiry: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const result = checkExpiry(value)
      if (result.ok) return

      const message =
        result.reason === 'past'
          ? 'That card has expired.'
          : result.reason === 'month'
            ? 'Month must be between 01 and 12.'
            : 'Use MM/YY, for example 12/30.'

      ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    }),

  cvv: z.string().trim().regex(/^\d{3,4}$/, 'The security code is 3 or 4 digits.'),

  billingCountry: z
    .string()
    .trim()
    .refine((v) => COUNTRY_CODES.includes(v), { message: 'Choose a billing country.' }),
})

/**
 * The CVV length depends on the brand, which depends on the number — so it is
 * checked here, where both fields are in scope, rather than on either alone.
 */
export const checkoutSchema = z
  .object({ planId: planIdSchema })
  .and(cardSchema)
  .superRefine((value, ctx) => {
    const expected = expectedCvvLength(detectBrand(value.cardNumber))
    if (value.cvv.length !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cvv'],
        message: `That card uses a ${expected}-digit security code.`,
      })
    }
  })

export type CheckoutInput = z.infer<typeof checkoutSchema>

/** First message per field, for a form that shows errors inline. */
export function cardFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !fields[key]) fields[key] = issue.message
  }
  return fields
}
