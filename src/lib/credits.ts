import { ArrowDownLeft, ArrowUpRight, Gift, RefreshCw, Wrench } from 'lucide-react'

import type { CreditReason } from '@/types/database'

/**
 * How a ledger reason is presented.
 *
 * Shared by the full ledger on the billing page and the activity strip on the
 * dashboard. It lived in the ledger table until the dashboard needed the same
 * eight words, and two copies of a label map is how "Refund" and "Refunded"
 * end up on the same screen.
 */
export const REASON_LABELS: Record<CreditReason, string> = {
  signup_grant: 'Welcome grant',
  generation_debit: 'Generation',
  generation_refund: 'Refund',
  admin_adjust: 'Adjustment',
  promo: 'Promo credit',
  subscription_grant: 'Monthly credits',
}

export const REASON_ICONS: Record<CreditReason, typeof Gift> = {
  signup_grant: Gift,
  generation_debit: ArrowUpRight,
  generation_refund: ArrowDownLeft,
  admin_adjust: Wrench,
  promo: Gift,
  subscription_grant: RefreshCw,
}
