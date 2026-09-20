'use server'

import { revalidatePath } from 'next/cache'

import type { PlanId } from '@/lib/plans'
import { cardFieldErrors, checkoutSchema } from '@/lib/validation/billing'
import {
  cancelSubscription,
  downgradeToFree,
  reactivateSubscription,
  subscribeToPlan,
  type ChangeOutcome,
} from '@/services/subscription.service'
import type { ActionResult } from '@/app/(studio)/projects/actions'

/**
 * A checkout can fail two entirely different ways, and the UI has to tell them
 * apart: a `validation` failure is typos the user can fix in place, a
 * `declined` failure is the gateway saying no.
 *
 * Showing a mistyped card number as "Payment failed" reads as "your card was
 * refused" and sends people to find a different card for a problem that was a
 * transposed digit.
 */
export type CheckoutFailure =
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'declined'; message: string }

/**
 * Billing Server Actions.
 *
 * Two things these deliberately do not accept: an amount, and a credit total.
 * The client passes a plan id and card details; what that plan costs and
 * grants is read from the catalogue on the server. An action that took an
 * amount would let a caller buy Enterprise for a penny.
 *
 * The card fields arrive here, are validated, and are handed to the gateway.
 * They are never written to the database, never logged, and never returned —
 * `ChangeOutcome` carries a plan, a credit balance and a reference, and
 * nothing else.
 */

/** Everywhere a plan change is visible. */
function revalidateBilling() {
  revalidatePath('/settings/billing')
  revalidatePath('/settings')
  revalidatePath('/dashboard')
  // The composer quotes limits that depend on the plan.
  revalidatePath('/create')
}

export type CheckoutResult =
  | { ok: true; data: ChangeOutcome }
  | { ok: false; failure: CheckoutFailure }

export async function checkoutAction(input: {
  planId: string
  cardholderName: string
  cardNumber: string
  expiry: string
  cvv: string
  billingCountry: string
}): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) {
    // Every field at once. Returning only the first sends the user through one
    // submit per mistake, and each round trip looks like another refusal.
    return { ok: false, failure: { kind: 'validation', fields: cardFieldErrors(parsed.error) } }
  }

  const { planId, ...card } = parsed.data

  const result = await subscribeToPlan(planId as PlanId, card)
  if (!result.ok) {
    // `invalid_number` and `incorrect_cvc` are the gateway re-checking shape.
    // They are the user's typo, not their bank's decision, so they go back to
    // the field rather than onto the failure screen.
    const field =
      result.code === 'invalid_number'
        ? 'cardNumber'
        : result.code === 'incorrect_cvc'
          ? 'cvv'
          : result.code === 'expired_card'
            ? 'expiry'
            : null

    if (field) {
      return { ok: false, failure: { kind: 'validation', fields: { [field]: result.error } } }
    }
    return { ok: false, failure: { kind: 'declined', message: result.error } }
  }

  revalidateBilling()
  return { ok: true, data: result.data }
}

export async function cancelSubscriptionAction(): Promise<ActionResult<{ endsAt: string | null }>> {
  const result = await cancelSubscription()
  if (!result.ok) return { ok: false, error: result.error }

  revalidateBilling()
  return { ok: true, data: result.data }
}

export async function reactivateSubscriptionAction(): Promise<ActionResult<{ plan: PlanId }>> {
  const result = await reactivateSubscription()
  if (!result.ok) return { ok: false, error: result.error }

  revalidateBilling()
  return { ok: true, data: result.data }
}

export async function downgradeToFreeAction(): Promise<ActionResult<{ plan: PlanId }>> {
  const result = await downgradeToFree()
  if (!result.ok) return { ok: false, error: result.error }

  revalidateBilling()
  return { ok: true, data: result.data }
}
