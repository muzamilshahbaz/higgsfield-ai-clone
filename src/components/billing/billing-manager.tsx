'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownRight, ArrowUpRight, Loader2, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  cancelSubscriptionAction,
  downgradeToFreeAction,
  reactivateSubscriptionAction,
} from '@/app/(studio)/settings/billing/actions'
import { CheckoutDialog } from '@/components/billing/checkout-dialog'
import { CurrentPlanButton, PlanCard } from '@/components/billing/plan-card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { comparePlans, getPlan, PLAN_LIST, type Plan, type PlanId } from '@/lib/plans'

/**
 * Plan selection and the destructive actions around it.
 *
 * Owns the three dialogs — checkout, cancel, downgrade — and nothing else.
 * Which plan the viewer is on, and whether it is ending, are decided on the
 * server and passed in; this component never works that out for itself.
 *
 * Every action that costs money or removes access asks first. The two that do
 * not are reactivating (which restores something) and opening checkout (which
 * has its own confirm step built in — the Pay button).
 */

interface BillingManagerProps {
  currentPlanId: PlanId
  /** Set when the plan is scheduled to end rather than renew. */
  endingAt: string | null
}

export function BillingManager({ currentPlanId, endingAt }: BillingManagerProps) {
  const router = useRouter()
  const [checkoutPlan, setCheckoutPlan] = React.useState<Plan | null>(null)
  const [confirmDowngrade, setConfirmDowngrade] = React.useState(false)
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)

  const isPaid = currentPlanId !== 'free'

  async function run(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setPending(key)
    try {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? 'Something went wrong.')
        return
      }
      toast.success(success)
      router.refresh()
    } catch {
      toast.error('Could not reach the server. Check your connection.')
    } finally {
      setPending(null)
      setConfirmCancel(false)
      setConfirmDowngrade(false)
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const relation = comparePlans(currentPlanId, plan.id)

          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlanId={currentPlanId}
              action={
                relation === 'same' ? (
                  <CurrentPlanButton />
                ) : plan.id === 'free' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={pending !== null}
                    onClick={() => setConfirmDowngrade(true)}
                  >
                    <ArrowDownRight className="size-4" aria-hidden />
                    Switch to Free
                  </Button>
                ) : (
                  <Button
                    variant={relation === 'upgrade' ? 'default' : 'outline'}
                    className="w-full"
                    disabled={pending !== null}
                    onClick={() => setCheckoutPlan(plan)}
                  >
                    {relation === 'upgrade' ? (
                      <ArrowUpRight className="size-4" aria-hidden />
                    ) : (
                      <ArrowDownRight className="size-4" aria-hidden />
                    )}
                    {relation === 'upgrade' ? 'Upgrade' : 'Change'} to {plan.name}
                  </Button>
                )
              }
            />
          )
        })}
      </div>

      {isPaid && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-4">
          <p className="text-sm text-muted-foreground">
            {endingAt
              ? 'Your plan is set to end. You keep everything until then.'
              : 'Cancel any time — you keep the plan until the period you have paid for runs out.'}
          </p>

          {endingAt ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() =>
                run('reactivate', reactivateSubscriptionAction, 'Your plan will renew as normal.')
              }
            >
              {pending === 'reactivate' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="size-4" aria-hidden />
              )}
              Keep my plan
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => setConfirmCancel(true)}
            >
              <X className="size-4" aria-hidden />
              Cancel plan
            </Button>
          )}
        </div>
      )}

      <CheckoutDialog
        plan={checkoutPlan}
        open={checkoutPlan !== null}
        onOpenChange={(open) => !open && setCheckoutPlan(null)}
        onSuccess={() => router.refresh()}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${getPlan(currentPlanId).name}?`}
        description={
          'Your plan stays active until the end of the period you have already paid for. ' +
          'After that you move to Free. Credits already in your balance are yours to keep.'
        }
        confirmLabel="Cancel plan"
        pending={pending === 'cancel'}
        onConfirm={() =>
          run('cancel', cancelSubscriptionAction, 'Your plan will end at the end of the period.')
        }
      />

      <ConfirmDialog
        open={confirmDowngrade}
        onOpenChange={setConfirmDowngrade}
        title="Switch to Free?"
        description={
          'This takes effect straight away. Your concurrency and hourly limits drop to the ' +
          'Free tier. Credits already in your balance are yours to keep.'
        }
        confirmLabel="Switch to Free"
        pending={pending === 'downgrade'}
        onConfirm={() => run('downgrade', downgradeToFreeAction, 'You are on the Free plan.')}
      />
    </>
  )
}
