import type { Metadata } from 'next'
import { Info } from 'lucide-react'

import { BillingManager } from '@/components/billing/billing-manager'
import { PlanComparison } from '@/components/billing/plan-comparison'
import { SubscriptionStatus } from '@/components/billing/subscription-status'
import { TransactionHistory } from '@/components/billing/transaction-history'
import { SettingsTabs } from '@/components/settings/settings-tabs'
import { Card } from '@/components/ui/card'
import { getBillingSnapshot } from '@/services/subscription.service'

export const metadata: Metadata = {
  title: 'Plan & billing',
  description: 'Your plan, your credits and your billing history.',
}

/**
 * The plan & billing tab.
 *
 * Every number on this page is resolved on the server from the subscription
 * row and the plan catalogue — the client components below render what they
 * are handed and never work out an entitlement for themselves.
 *
 * The demo notice is at the top rather than the bottom. Someone about to be
 * shown a card form should know what kind of system this is before they read
 * the prices, not after.
 */
export default async function BillingPage() {
  const { plan, subscription, transactions, credits, endingAt } = await getBillingSnapshot()

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your profile and your credit ledger.</p>
      </div>

      <SettingsTabs />

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Plan &amp; billing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Credits, not seats. Change plan, cancel or restart at any time.
          </p>
        </div>

        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Demonstration billing</p>
              <p className="mt-1 text-muted-foreground">
                This deployment has no payment provider connected. Checkout is simulated: no card
                is charged, no card details are stored, and the subscriptions and receipts below
                are real database records of a pretend transaction.
              </p>
            </div>
          </div>
        </Card>

        <SubscriptionStatus plan={plan} subscription={subscription} credits={credits} />

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Change your plan</h3>
          <BillingManager currentPlanId={plan.id} endingAt={endingAt} />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Compare plans</h3>
          <Card className="p-6">
            <PlanComparison currentPlanId={plan.id} />
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Billing history</h3>
          <Card className="p-6">
            <TransactionHistory transactions={transactions} />
          </Card>
        </div>
      </div>
    </div>
  )
}
