import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { CreditLedgerRow } from '@/types/database'

/**
 * Credits.
 *
 * Nothing in this file does arithmetic on a balance. Every movement goes
 * through `spend_credits` / `refund_credits` in 0002_functions.sql, which lock
 * the profile row and write the ledger in the same transaction — so two
 * concurrent Generate clicks cannot both read the same balance and both spend it.
 *
 * Those functions are granted to the service role only, which is why the
 * writes here use the admin client and pass `user_id` explicitly.
 */

export type SpendOutcome =
  | { ok: true; balance: number }
  | { ok: false; code: 'INSUFFICIENT_CREDITS'; balance: number }
  | { ok: false; code: 'ERROR'; message: string }

export async function spendCredits(params: {
  userId: string
  amount: number
  generationId?: string | null
  note?: string | null
}): Promise<SpendOutcome> {
  const { userId, amount, generationId = null, note = null } = params

  if (amount <= 0) {
    // Free generations still take the happy path; there is just nothing to debit.
    const balance = await getBalance(userId)
    return { ok: true, balance: balance ?? 0 }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('spend_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_generation_id: generationId,
    p_note: note,
  })

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS')) {
      const balance = await getBalance(userId)
      return { ok: false, code: 'INSUFFICIENT_CREDITS', balance: balance ?? 0 }
    }
    console.error('[credits.service] spendCredits failed:', error.message)
    return { ok: false, code: 'ERROR', message: 'Could not reserve credits. Try again.' }
  }

  return { ok: true, balance: data ?? 0 }
}

/**
 * Gives the credits back for a job that failed or timed out.
 *
 * Safe to call more than once: the SQL function returns early when a refund
 * row already exists for the generation, and a unique index on
 * (generation_id, reason) makes a double-credit impossible even under a race.
 */
export async function refundCredits(params: {
  userId: string
  amount: number
  generationId: string
  note?: string | null
}): Promise<number | null> {
  const { userId, amount, generationId, note = null } = params
  if (amount <= 0) return null

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_generation_id: generationId,
    p_note: note,
  })

  if (error) {
    console.error('[credits.service] refundCredits failed:', error.message)
    return null
  }
  return data ?? null
}

/** Authoritative balance, read past RLS. Server-side callers only. */
export async function getBalance(userId: string): Promise<number | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[credits.service] getBalance failed:', error.message)
    return null
  }
  return data?.credits ?? null
}

/** The signed-in user's ledger, newest first. Read through RLS. */
export async function listMyLedger(limit = 50): Promise<CreditLedgerRow[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[credits.service] listMyLedger failed:', error.message)
    return []
  }
  return data ?? []
}
