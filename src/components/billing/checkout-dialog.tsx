'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, CreditCard, Loader2, Lock, ShieldAlert, XCircle } from 'lucide-react'

import { checkoutAction } from '@/app/(studio)/settings/billing/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  detectBrand,
  expectedCvvLength,
  formatCardNumber,
  formatExpiry,
  BRAND_LABELS,
} from '@/lib/payments/card'
import type { Plan } from '@/lib/plans'
import { COUNTRIES } from '@/lib/validation/billing'
import { cn } from '@/lib/utils'

/**
 * The demo checkout.
 *
 * No card details leave the browser except to the Server Action that validates
 * them and hands them to a simulated gateway; none are stored, and the state
 * below is dropped the moment the dialog closes.
 *
 * The banner at the top is not decoration. Anyone who reaches a form asking
 * for a card number is entitled to know before they start typing that it is
 * not real, and burying that in small print under the button would be a
 * dishonest design even for a demo.
 *
 * Four states: `form`, `processing`, `success`, `error`. `processing` is
 * driven by the action's own latency rather than a timer, so the animation
 * ends when the work does.
 */

type Phase = 'form' | 'processing' | 'success' | 'error'

interface CheckoutDialogProps {
  plan: Plan | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after a successful charge so the page can refresh. */
  onSuccess: (outcome: { credits: number; reference?: string }) => void
}

const PROCESSING_STEPS = [
  'Contacting the payment provider',
  'Authorising the card',
  'Confirming the subscription',
]

export function CheckoutDialog({ plan, open, onOpenChange, onSuccess }: CheckoutDialogProps) {
  const [phase, setPhase] = React.useState<Phase>('form')
  const [step, setStep] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [outcome, setOutcome] = React.useState<{ credits: number; reference?: string } | null>(null)

  const [cardholderName, setCardholderName] = React.useState('')
  const [cardNumber, setCardNumber] = React.useState('')
  const [expiry, setExpiry] = React.useState('')
  const [cvv, setCvv] = React.useState('')
  const [billingCountry, setBillingCountry] = React.useState('GB')

  const brand = detectBrand(cardNumber)
  const cvvLength = expectedCvvLength(brand)

  // Everything typed is dropped when the dialog closes. Nothing is persisted,
  // so reopening starts from an empty form rather than a remembered card.
  React.useEffect(() => {
    if (open) return
    const t = setTimeout(() => {
      setPhase('form')
      setStep(0)
      setError(null)
      setFieldErrors({})
      setOutcome(null)
      setCardholderName('')
      setCardNumber('')
      setExpiry('')
      setCvv('')
      setBillingCountry('GB')
    }, 200)
    return () => clearTimeout(t)
  }, [open])

  // Advances the step labels while the action is in flight. Purely cosmetic:
  // the phase changes when the promise settles, not when this runs out.
  React.useEffect(() => {
    if (phase !== 'processing') return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1)), 700)
    return () => clearInterval(t)
  }, [phase])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!plan) return

    setError(null)
    setFieldErrors({})
    setStep(0)
    setPhase('processing')

    try {
      const result = await checkoutAction({
        planId: plan.id,
        cardholderName,
        cardNumber,
        expiry,
        cvv,
        billingCountry,
      })

      if (!result.ok) {
        setError(result.error)
        if (result.field) setFieldErrors({ [result.field]: result.error })
        setPhase('error')
        return
      }

      setOutcome({ credits: result.data.credits, reference: result.data.reference })
      setPhase('success')
      onSuccess({ credits: result.data.credits, reference: result.data.reference })
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setPhase('error')
    }
  }

  if (!plan) return null

  return (
    <Dialog open={open} onOpenChange={phase === 'processing' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {phase === 'success' ? 'Payment complete' : `Subscribe to ${plan.name}`}
          </DialogTitle>
          <DialogDescription>
            {phase === 'success'
              ? `You are on the ${plan.name} plan.`
              : `£${plan.priceGbp} ${plan.cadence} · ${plan.credits.toLocaleString()} credits`}
          </DialogDescription>
        </DialogHeader>

        {/*
          The phase panel, rendered directly — deliberately not wrapped in
          `AnimatePresence mode="wait"`.
          That wrapper holds the incoming panel back until the outgoing one
          finishes its exit animation, and here the exit never completed: the
          form stayed mounted under a "Payment complete" heading while the
          success panel never appeared, even though the charge had gone
          through. Three declined payments were recorded server-side while the
          dialog still showed an untouched form.
          The animation was only ever cosmetic, so each panel now fades in on
          mount and nothing can block the state the user needs to see.
        */}
        <>
          {phase === 'form' ? (
            <motion.form
              key="form"
              onSubmit={submit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              <DemoNotice />

              <div className="space-y-1.5">
                <Label htmlFor="cardholderName">Cardholder name</Label>
                <Input
                  id="cardholderName"
                  autoComplete="off"
                  placeholder="Ada Lovelace"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.cardholderName)}
                />
                <FieldError message={fieldErrors.cardholderName} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cardNumber">Card number</Label>
                <div className="relative">
                  <Input
                    id="cardNumber"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    aria-invalid={Boolean(fieldErrors.cardNumber)}
                    className="pr-20"
                  />
                  {brand !== 'unknown' && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                      {BRAND_LABELS[brand]}
                    </span>
                  )}
                </div>
                <FieldError message={fieldErrors.cardNumber} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="expiry">Expiry</Label>
                  <Input
                    id="expiry"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12/30"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    aria-invalid={Boolean(fieldErrors.expiry)}
                  />
                  <FieldError message={fieldErrors.expiry} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cvv">Security code</Label>
                  <Input
                    id="cvv"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={'1'.repeat(cvvLength).replace(/1/g, '•')}
                    maxLength={cvvLength}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, cvvLength))}
                    aria-invalid={Boolean(fieldErrors.cvv)}
                  />
                  <FieldError message={fieldErrors.cvv} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="billingCountry">Billing country</Label>
                <select
                  id="billingCountry"
                  value={billingCountry}
                  onChange={(e) => setBillingCountry(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldErrors.billingCountry} />
              </div>

              <Button type="submit" className="w-full">
                <Lock className="size-4" aria-hidden />
                Pay £{plan.priceGbp}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                No card is charged and no card details are stored.
              </p>
            </motion.form>
          ) : phase === 'processing' ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-5 py-10"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-9 animate-spin text-brand" aria-hidden />
              <div className="space-y-2 text-center">
                {PROCESSING_STEPS.map((label, i) => (
                  <p
                    key={label}
                    className={cn(
                      'text-sm transition-colors',
                      i === step ? 'font-medium text-foreground' : 'text-muted-foreground/50',
                    )}
                  >
                    {label}
                  </p>
                ))}
              </div>
            </motion.div>
          ) : phase === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-8 text-center"
            >
              <CheckCircle2 className="size-11 text-success" aria-hidden />
              <div>
                <p className="font-medium">You are on {plan.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {outcome?.credits.toLocaleString()} credits are in your balance now.
                </p>
                {outcome?.reference && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {outcome.reference}
                  </p>
                )}
              </div>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Back to billing
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 py-8 text-center"
            >
              <XCircle className="size-11 text-danger" aria-hidden />
              <div>
                <p className="font-medium">Payment failed</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button className="flex-1" onClick={() => setPhase('form')}>
                  Try again
                </Button>
              </div>
            </motion.div>
          )}
        </>
      </DialogContent>
    </Dialog>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-danger">{message}</p>
}

/**
 * Said before the first field, not after the last.
 *
 * Also names the two cards worth knowing, because a demo where you have to
 * guess a valid card number is a demo nobody completes.
 */
function DemoNotice() {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="space-y-1.5 text-xs">
          <p className="font-medium text-foreground">Demo payment — no money moves</p>
          <p className="text-muted-foreground">
            This is a simulated checkout. Nothing is sent to a payment provider and no card
            details are stored. Do not enter a real card.
          </p>
          <p className="text-muted-foreground">
            <CreditCard className="mr-1 inline size-3" aria-hidden />
            Use <code className="font-mono">4242 4242 4242 4242</code> to succeed, or{' '}
            <code className="font-mono">4000 0000 0000 0002</code> to see a decline. Any future
            expiry and any CVV.
          </p>
        </div>
      </div>
    </div>
  )
}
