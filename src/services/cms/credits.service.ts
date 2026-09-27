import 'server-only'

import { cache } from 'react'

import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { cmsAdminClient } from '@/lib/supabase/cms'
import type { CreditRuleRow } from '@/types/cms'

/**
 * Credit rules — where credits come from.
 *
 * One row per grant. The `signup_grant` row is the live one: migration 0019
 * rewrote `handle_new_user()` to read it, with 200 as the fallback for a missing
 * row, a disabled rule or an unreadable table. So the amount an account is given
 * at signup is configured here, and the landing page's "200 credits on signup"
 * reads the same number rather than a literal that could disagree with it.
 *
 * `credit_rules` is NOT publicly readable — RLS is forced and the grants are
 * revoked. The signup figure still reaches the marketing page, but via the free
 * plan's `credits` and the `signup_credits` stat, both of which are public. An
 * operator's whole grant table is not something an anonymous visitor needs.
 *
 * `referral_bonus` is seeded disabled. There is no referral flow in this build,
 * and nothing awards it — the row exists so the figure is configured before the
 * feature lands rather than hard-coded into it afterwards. The admin screen says so
 * on the row.
 */

export type CreditRuleKey =
  | 'signup_grant'
  | 'monthly_renewal'
  | 'plan_pro'
  | 'plan_enterprise'
  | 'bonus_grant'
  | 'referral_bonus'

export interface CreditRule {
  key: string
  label: string
  description: string | null
  amount: number
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

function toRule(row: CreditRuleRow): CreditRule {
  return {
    key: row.key,
    label: row.label,
    description: row.description,
    amount: row.amount,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

/** Every rule, in display order. Admin only — see the note on RLS above. */
export const listCreditRules = cache(async (): Promise<CreditRule[]> => {
  const { data, error } = await cmsAdminClient()
    .from('credit_rules')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[credits.service] list failed:', error.message)
    return []
  }
  return (data ?? []).map(toRule)
})

/**
 * One rule's amount, or its code-level fallback.
 *
 * Used by the admin forms that want to prefill a figure — the credit-grant dialog
 * on a user's page defaults to `bonus_grant`. The signup path does NOT come through
 * here: it reads the row in Postgres, inside the same transaction that creates the
 * account, because a grant resolved in the application and applied in a trigger is
 * two sources of truth waiting to disagree.
 */
export async function creditRuleAmount(key: CreditRuleKey, fallback: number): Promise<number> {
  const rules = await listCreditRules()
  const rule = rules.find((entry) => entry.key === key)
  if (!rule || !rule.enabled) return fallback
  return rule.amount
}

/**
 * The signup grant, for a surface that wants to quote it.
 *
 * Falls back to `SIGNUP_CREDIT_GRANT`, which is the value `handle_new_user()` also
 * falls back to — so the page and the trigger cannot disagree even when the table
 * is unreadable.
 */
export async function signupGrant(): Promise<number> {
  return creditRuleAmount('signup_grant', SIGNUP_CREDIT_GRANT)
}
