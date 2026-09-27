import 'server-only'

import { cache } from 'react'

import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { AccountStatus } from '@/types/database'

/**
 * Account suspension.
 *
 * Where this is enforced, and why it is not in the middleware:
 *
 *   The middleware runs on every navigation and every API call, and checking an account's status
 *   there would mean a second database round trip on all of them — to change the outcome of a
 *   vanishingly small fraction. Instead the check sits at the two places it actually matters: the
 *   studio shell, which is what a suspended person sees, and the write endpoints, which are what a
 *   suspended person could otherwise still use.
 *
 *   It is also deliberately not a policy. RLS on `profiles` is own-row, and a suspended user has to
 *   be able to read their own row — that is exactly what the notice needs in order to say why and
 *   until when. Locking the row would produce a notice that could not explain itself.
 *
 * A suspension with an end date lifts itself: `suspended_until` in the past reads as active without
 * anything having to write the row back. That means no nightly job, and no account left locked
 * because a job did not run.
 */

export interface AccountState {
  status: AccountStatus
  reason: string | null
  /** Null for a ban, which has no end. */
  until: string | null
  /** True when the account may use the product right now. */
  active: boolean
}

const ACTIVE: AccountState = { status: 'active', reason: null, until: null, active: true }

/**
 * The signed-in account's state, or `active` for anybody who is not signed in.
 *
 * Returning active on every failure is the right direction here: this is a lock, and a lock that
 * engages when the database hiccups locks everybody out at once. The failure that costs something
 * is a suspended user getting one more generation; the failure the other way is an outage.
 */
export const getAccountState = cache(async (): Promise<AccountState> => {
  const user = await getCurrentUser()
  if (!user) return ACTIVE

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('status, status_reason, suspended_until')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) return ACTIVE
    if (data.status === 'active') return ACTIVE

    // A suspension whose end has passed is over. Read as active without writing the row back, so
    // this needs no scheduled job and cannot leave somebody locked out because one did not run.
    if (
      data.status === 'suspended' &&
      data.suspended_until &&
      new Date(data.suspended_until).getTime() <= Date.now()
    ) {
      return ACTIVE
    }

    return {
      status: data.status,
      reason: data.status_reason,
      until: data.status === 'suspended' ? data.suspended_until : null,
      active: false,
    }
  } catch {
    return ACTIVE
  }
})

/**
 * The sentence an endpoint returns to a suspended caller.
 *
 * Says which state and, for a suspension, when it ends — because "your account is restricted" with
 * no end date and no reason is the support ticket this function exists to prevent.
 */
export function suspensionMessage(state: AccountState): string {
  if (state.active) return ''

  if (state.status === 'banned') {
    return state.reason
      ? `This account has been banned: ${state.reason}`
      : 'This account has been banned.'
  }

  const until = state.until
    ? ` It lifts on ${new Date(state.until).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}.`
    : ''

  return state.reason
    ? `This account is suspended: ${state.reason}${until}`
    : `This account is suspended.${until}`
}
