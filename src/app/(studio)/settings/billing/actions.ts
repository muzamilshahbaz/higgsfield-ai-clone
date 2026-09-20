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

export async function checkoutAction(input: {
  planId: string
  cardholderName: string
  cardNumber: string
  expiry: string
  cvv: string
  billingCountry: string
}): Promise<ActionResult<ChangeOutcome>> {
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) {
    const fields = cardFieldErrors(parsed.error)
    const [field, message] = Object.entries(fields)[0] ?? ['', 'Check the form and try again.']
    return { ok: false, error: message, field }
  }

  const { planId, ...card } = parsed.data

  const result = await subscribeToPlan(planId as PlanId, card)
  if (!result.ok) return { ok: false, error: result.error }

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
