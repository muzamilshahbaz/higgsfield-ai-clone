import 'server-only'

import {
  comparePlans,
  FREE_PLAN,
  getPlan,
  isPlanId,
  type Plan,
  type PlanId,
  planFor,
  priceInPence,
} from '@/lib/plans'
import { getGateway, type CardDetails } from '@/lib/payments/demo-gateway'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, tryCreateClient } from '@/lib/supabase/server'
import type { PaymentTransactionRow, PlanTier, SubscriptionRow } from '@/types/database'

/**
 * Subscriptions.
 *
 * The only module that decides what plan somebody is on and what changing it
 * does. Three rules hold it together:
 *
 * 1. **The client never names a price or a credit amount.** An action passes a
 *    plan id; everything the change costs and grants is read from the
 *    catalogue here. A caller who could name an amount could buy Enterprise
 *    for a penny.
 * 2. **Credits move only through the SQL function.** `set_subscription_credits`
 *    locks the profile row and writes the ledger in one transaction, the same
 *    rule every other credit movement in this app follows.
 * 3. **A charge is taken before the plan changes, and the plan changes only if
 *    the charge succeeded.** A failed payment leaves a `failed` transaction row
 *    and nothing else — no plan change, no credits.
 *
 * The payment itself is simulated (see `lib/payments/`). This module does not
 * know that: it asks a gateway for a charge and acts on the result.
 */

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The signed-in user's subscription row, or null when they have never bought. */
export async function getMySubscription(): Promise<SubscriptionRow | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await tryCreateClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[subscription.service] getMySubscription failed:', error.message)
    return null
  }
  return data
}

/** The signed-in user's billing history, newest first. */
export async function listMyTransactions(limit = 20): Promise<PaymentTransactionRow[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await tryCreateClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[subscription.service] listMyTransactions failed:', error.message)
    return []
  }
  return data ?? []
}

/**
 * The plan to enforce for a user.
 *
 * Takes a user id rather than reading the session, because the generation path
 * calls it with a user it has already resolved. Falls back to free on any
 * error: a billing lookup that fails should cost someone their higher
 * concurrency limit, never their ability to work.
 */
export async function planForUser(userId: string): Promise<Plan> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('subscriptions')
      .select('plan, status, cancel_at_period_end, current_period_end')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[subscription.service] planForUser failed:', error.message)
      return FREE_PLAN
    }
    if (!data) return FREE_PLAN

    // A subscription set to cancel keeps its plan until the period actually
    // ends — they paid for the month. Past that, they are on free whatever the
    // row still says, because nothing here runs a nightly job to rewrite it.
    if (hasLapsed(data)) return FREE_PLAN

    return planFor(data.plan, data.status)
  } catch (cause) {
    console.error('[subscription.service] planForUser threw:', cause)
    return FREE_PLAN
  }
}

/** True once a cancelled subscription's paid-up period has run out. */
function hasLapsed(row: Pick<SubscriptionRow, 'cancel_at_period_end' | 'current_period_end'>) {
  if (!row.cancel_at_period_end || !row.current_period_end) return false
  return new Date(row.current_period_end).getTime() < Date.now()
}

/** What the UI needs to render the billing page, resolved server-side. */
export interface BillingSnapshot {
  plan: Plan
  subscription: SubscriptionRow | null
  transactions: PaymentTransactionRow[]
  credits: number
  /** True when the plan is set to end rather than renew. */
  endingAt: string | null
}

export async function getBillingSnapshot(): Promise<BillingSnapshot> {
  const user = await getCurrentUser()
  if (!user) {
    return { plan: FREE_PLAN, subscription: null, transactions: [], credits: 0, endingAt: null }
  }

  const [subscription, transactions] = await Promise.all([
    getMySubscription(),
    listMyTransactions(),
  ])

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .maybeSingle()

  const lapsed = subscription ? hasLapsed(subscription) : false
  const plan = subscription && !lapsed ? planFor(subscription.plan, subscription.status) : FREE_PLAN

  return {
    plan,
    subscription,
    transactions,
    credits: profile?.credits ?? 0,
    endingAt: subscription?.cancel_at_period_end ? subscription.current_period_end : null,
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type SubscriptionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }

export interface ChangeOutcome {
  plan: PlanId
  credits: number
  /** Present when money notionally moved. */
  reference?: string
  change: 'upgrade' | 'downgrade' | 'same' | 'new'
}

/** One month from `from`, which is how every period in this system is set. */
function addMonth(from: Date): Date {
  const next = new Date(from)
  next.setMonth(next.getMonth() + 1)
  return next
}

async function recordTransaction(entry: {
  userId: string
  plan: PlanTier
  amountPence: number
  status: 'succeeded' | 'failed'
  description: string
  cardBrand?: string | null
  cardLast4?: string | null
  billingCountry?: string | null
  reference?: string | null
  failureCode?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('payment_transactions').insert({
    user_id: entry.userId,
    plan: entry.plan,
    amount_pence: entry.amountPence,
    status: entry.status,
    description: entry.description,
    card_brand: entry.cardBrand ?? null,
    card_last4: entry.cardLast4 ?? null,
    billing_country: entry.billingCountry ?? null,
    reference: entry.reference ?? null,
    failure_code: entry.failureCode ?? null,
  })
  if (error) console.error('[subscription.service] recordTransaction failed:', error.message)
}

/**
 * Buys or changes a paid plan, taking a payment first.
 *
 * The card never leaves this call: it goes to the gateway, which returns a
 * brand and last four. Nothing else about it is kept.
 */
export async function subscribeToPlan(
  planId: PlanId,
  card: CardDetails,
): Promise<SubscriptionResult<ChangeOutcome>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  if (!isPlanId(planId) || planId === 'free') {
    return { ok: false, error: 'Choose a paid plan to continue.' }
  }

  const plan = getPlan(planId)
  const current = await getMySubscription()
  const currentPlanId: PlanId = current && !hasLapsed(current) ? (current.plan as PlanId) : 'free'

  if (currentPlanId === planId && current?.status === 'active' && !current.cancel_at_period_end) {
    return { ok: false, error: `You are already on the ${plan.name} plan.` }
  }

  const amountPence = priceInPence(plan)

  const charge = await getGateway().charge({
    amountPence,
    currency: 'gbp',
    description: `Kinetic ${plan.name} — one month`,
    card,
  })

  if (!charge.ok) {
    await recordTransaction({
      userId: user.id,
      plan: planId,
      amountPence,
      status: 'failed',
      description: `${plan.name} — payment declined`,
      cardBrand: charge.brandLabel ?? null,
      cardLast4: charge.last4 ?? null,
      billingCountry: card.billingCountry,
      failureCode: charge.code,
    })
    return { ok: false, error: charge.message, code: charge.code }
  }

  const now = new Date()
  const periodEnd = addMonth(now)

  const admin = createAdminClient()
  const { error: upsertError } = await admin.from('subscriptions').upsert(
    {
      user_id: user.id,
      plan: planId,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      // Buying again clears a pending cancellation — that is what the
      // "reactivate" path does, and paying for a new term means the same thing.
      cancel_at_period_end: false,
      canceled_at: null,
    },
    { onConflict: 'user_id' },
  )

  if (upsertError) {
    // The charge "succeeded" but the plan did not change. Recorded so the
    // history does not silently lose a payment, and surfaced as an error
    // rather than a success the user cannot see the effect of.
    console.error('[subscription.service] subscribe upsert failed:', upsertError.message)
    await recordTransaction({
      userId: user.id,
      plan: planId,
      amountPence,
      status: 'failed',
      description: `${plan.name} — could not activate`,
      failureCode: 'processing_error',
    })
    return { ok: false, error: 'The payment went through but the plan could not be activated.' }
  }

  await recordTransaction({
    userId: user.id,
    plan: planId,
    amountPence,
    status: 'succeeded',
    description: `Kinetic ${plan.name} — one month`,
    cardBrand: charge.brandLabel,
    cardLast4: charge.last4,
    billingCountry: card.billingCountry,
    reference: charge.reference,
  })

  const credits = await applyPlanCredits(user.id, plan)

  return {
    ok: true,
    data: {
      plan: planId,
      credits,
      reference: charge.reference,
      change: currentPlanId === 'free' ? 'new' : comparePlans(currentPlanId, planId),
    },
  }
}

/**
 * Tops the balance up to the plan's allowance.
 *
 * Never removes credits — see the note on `set_subscription_credits`. Somebody
 * downgrading keeps what they already paid for.
 */
async function applyPlanCredits(userId: string, plan: Plan): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('set_subscription_credits', {
    p_user_id: userId,
    p_amount: plan.credits,
    p_note: `${plan.name} plan — monthly credits`,
  })

  if (error) {
    console.error('[subscription.service] applyPlanCredits failed:', error.message)
    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .maybeSingle()
    return profile?.credits ?? 0
  }
  return data ?? plan.credits
}

/**
 * Schedules a cancellation for the end of the paid period.
 *
 * Deliberately not immediate. They paid for the month; taking it away the
 * moment they click cancel is the kind of thing that makes people not come
 * back. `planForUser` treats the plan as live until `current_period_end`.
 */
export async function cancelSubscription(): Promise<SubscriptionResult<{ endsAt: string | null }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const current = await getMySubscription()
  if (!current || current.plan === 'free') {
    return { ok: false, error: 'There is no paid plan to cancel.' }
  }
  if (current.cancel_at_period_end) {
    return { ok: false, error: 'That plan is already set to end.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('subscriptions')
    .update({ cancel_at_period_end: true, canceled_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) {
    console.error('[subscription.service] cancel failed:', error.message)
    return { ok: false, error: 'Could not cancel that plan. Try again in a moment.' }
  }
  return { ok: true, data: { endsAt: current.current_period_end } }
}

/** Undoes a scheduled cancellation, while the period is still running. */
export async function reactivateSubscription(): Promise<SubscriptionResult<{ plan: PlanId }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const current = await getMySubscription()
  if (!current || !current.cancel_at_period_end) {
    return { ok: false, error: 'There is nothing to reactivate.' }
  }
  if (hasLapsed(current)) {
    return { ok: false, error: 'That plan has already ended. Choose a plan to start again.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('subscriptions')
    .update({ cancel_at_period_end: false, canceled_at: null })
    .eq('user_id', user.id)

  if (error) {
    console.error('[subscription.service] reactivate failed:', error.message)
    return { ok: false, error: 'Could not reactivate that plan. Try again in a moment.' }
  }
  return { ok: true, data: { plan: current.plan as PlanId } }
}

/**
 * Moves to the free plan without taking a payment.
 *
 * Applied at once rather than at period end, because it is what someone asks
 * for when they pick "Free" from the plan list rather than pressing cancel.
 * Credits already granted are kept.
 */
export async function downgradeToFree(): Promise<SubscriptionResult<{ plan: PlanId }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const current = await getMySubscription()
  if (!current || current.plan === 'free') {
    return { ok: false, error: 'You are already on the Free plan.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('subscriptions')
    .update({
      plan: 'free',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: new Date().toISOString(),
      current_period_end: null,
    })
    .eq('user_id', user.id)

  if (error) {
    console.error('[subscription.service] downgrade failed:', error.message)
    return { ok: false, error: 'Could not change that plan. Try again in a moment.' }
  }
  return { ok: true, data: { plan: 'free' } }
}
