'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, Lock, ShieldAlert, Sparkles, XCircle } from 'lucide-react'

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
import { CountrySelect } from '@/components/ui/country-select'
import {
  BRAND_LABELS,
  detectBrand,
  expectedCvvLength,
  formatCardNumber,
  formatExpiry,
} from '@/lib/payments/card'
import type { Plan } from '@/lib/plans'
import { cardSchema } from '@/lib/validation/billing'
import { cn } from '@/lib/utils'

/**
 * The demo checkout.
 *
 * No card details are stored, and the state below is dropped when the dialog
 * closes. The notice sits above the first field rather than under the button:
 * anyone being asked for a card number is entitled to know it is not real
 * before they start typing.
 *
 * **Typos are not declines.** A mistyped card number used to render the same
 * full-screen "Payment failed" as a refused card, which reads as "your bank
 * said no" and sends people looking for a different card over a transposed
 * digit. Format problems now stay on the form, on the field that caused them,
 * and only the gateway actually refusing gets the failure screen.
 *
 * Each phase renders directly and fades in — deliberately not wrapped in
 * `AnimatePresence mode="wait"`, which once held the incoming panel back
 * forever and left a paid-for subscription behind an untouched form.
 */

type Phase = 'form' | 'processing' | 'success' | 'error'
type FieldName = 'cardholderName' | 'cardNumber' | 'expiry' | 'cvv' | 'billingCountry'

interface CheckoutDialogProps {
  plan: Plan | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (outcome: { credits: number; reference?: string }) => void
}

const PROCESSING_STEPS = [
  'Contacting the payment provider',
  'Authorising the card',
  'Confirming the subscription',
]

const DEMO_CARD = { number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' }

export function CheckoutDialog({ plan, open, onOpenChange, onSuccess }: CheckoutDialogProps) {
  const [phase, setPhase] = React.useState<Phase>('form')
  const [step, setStep] = React.useState(0)
  const [declineMessage, setDeclineMessage] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({})
  const [outcome, setOutcome] = React.useState<{ credits: number; reference?: string } | null>(null)

  const [values, setValues] = React.useState({
    cardholderName: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
    billingCountry: 'GB',
  })

  const brand = detectBrand(values.cardNumber)
  const cvvLength = expectedCvvLength(brand)

  React.useEffect(() => {
    if (open) return
    const t = setTimeout(() => {
      setPhase('form')
      setStep(0)
      setDeclineMessage(null)
      setErrors({})
      setOutcome(null)
      setValues({ cardholderName: '', cardNumber: '', expiry: '', cvv: '', billingCountry: 'GB' })
    }, 200)
    return () => clearTimeout(t)
  }, [open])

  React.useEffect(() => {
    if (phase !== 'processing') return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1)), 700)
    return () => clearInterval(t)
  }, [phase])

  function set(field: FieldName, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    // Clear the error the moment the field is edited. Leaving it up while
    // someone is mid-correction reads as "still wrong" before they have
    // finished typing the fix.
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }

  /** Re-checks one field on blur, so a mistake surfaces before the Pay button. */
  function validateField(field: FieldName, current = values) {
    const result = cardSchema.safeParse(current)
    if (result.success) {
      setErrors((e) => ({ ...e, [field]: undefined }))
      return
    }
    const issue = result.error.issues.find((i) => i.path[0] === field)
    setErrors((e) => ({ ...e, [field]: issue?.message }))
  }

  function fillDemoCard() {
    setValues((v) => ({
      ...v,
      // A name already typed is the user's own and is not overwritten.
      cardholderName: v.cardholderName || 'Ada Lovelace',
      cardNumber: DEMO_CARD.number,
      expiry: DEMO_CARD.expiry,
      cvv: DEMO_CARD.cvv,
    }))
    // Only the fields this actually filled. Clearing every error would hide a
    // real problem on a field the button deliberately left alone.
    setErrors((e) => ({ ...e, cardNumber: undefined, expiry: undefined, cvv: undefined }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!plan) return

    // Validated here first so obvious mistakes never cost a round trip, and so
    // every bad field lights up at once rather than one per attempt.
    const local = cardSchema.safeParse(values)
    if (!local.success) {
      const next: Partial<Record<FieldName, string>> = {}
      for (const issue of local.error.issues) {
        const key = issue.path[0] as FieldName
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    setErrors({})
    setDeclineMessage(null)
    setStep(0)
    setPhase('processing')

    try {
      const result = await checkoutAction({ planId: plan.id, ...values })

      if (!result.ok) {
        if (result.failure.kind === 'validation') {
          setErrors(result.failure.fields as Partial<Record<FieldName, string>>)
          setPhase('form')
          return
        }
        setDeclineMessage(result.failure.message)
        setPhase('error')
        return
      }

      setOutcome({ credits: result.data.credits, reference: result.data.reference })
      setPhase('success')
      onSuccess({ credits: result.data.credits, reference: result.data.reference })
    } catch {
      setDeclineMessage('Could not reach the server. Check your connection and try again.')
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
              : `${plan.credits.toLocaleString()} credits a month · cancel any time`}
          </DialogDescription>
        </DialogHeader>

        {phase === 'form' ? (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="min-h-0 space-y-4 overflow-y-auto p-5"
            noValidate
          >
            <DemoNotice onFill={fillDemoCard} />

            <Field id="cardholderName" label="Cardholder name" error={errors.cardholderName}>
              <Input
                id="cardholderName"
                autoComplete="off"
                placeholder="Ada Lovelace"
                value={values.cardholderName}
                onChange={(e) => set('cardholderName', e.target.value)}
                onBlur={() => validateField('cardholderName')}
                aria-invalid={Boolean(errors.cardholderName)}
                aria-describedby={errors.cardholderName ? 'cardholderName-error' : undefined}
              />
            </Field>

            <Field id="cardNumber" label="Card number" error={errors.cardNumber}>
              <div className="relative">
                <Input
                  id="cardNumber"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="4242 4242 4242 4242"
                  value={values.cardNumber}
                  onChange={(e) => set('cardNumber', formatCardNumber(e.target.value))}
                  onBlur={() => validateField('cardNumber')}
                  aria-invalid={Boolean(errors.cardNumber)}
                  aria-describedby={errors.cardNumber ? 'cardNumber-error' : undefined}
                  className={cn(brand !== 'unknown' && 'pr-24')}
                />
                {brand !== 'unknown' && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {BRAND_LABELS[brand]}
                  </span>
                )}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="expiry" label="Expiry" error={errors.expiry}>
                <Input
                  id="expiry"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="MM/YY"
                  maxLength={5}
                  value={values.expiry}
                  onChange={(e) => set('expiry', formatExpiry(e.target.value))}
                  onBlur={() => validateField('expiry')}
                  aria-invalid={Boolean(errors.expiry)}
                  aria-describedby={errors.expiry ? 'expiry-error' : undefined}
                />
              </Field>

              <Field
                id="cvv"
                label="Security code"
                hint={`${cvvLength} digits`}
                error={errors.cvv}
              >
                <Input
                  id="cvv"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={'•'.repeat(cvvLength)}
                  maxLength={cvvLength}
                  value={values.cvv}
                  onChange={(e) => set('cvv', e.target.value.replace(/\D/g, '').slice(0, cvvLength))}
                  onBlur={() => validateField('cvv')}
                  aria-invalid={Boolean(errors.cvv)}
                  aria-describedby={errors.cvv ? 'cvv-error' : undefined}
                />
              </Field>
            </div>

            <Field id="billingCountry" label="Billing country" error={errors.billingCountry}>
              <CountrySelect
                id="billingCountry"
                value={values.billingCountry}
                onChange={(code) => set('billingCountry', code)}
                invalid={Boolean(errors.billingCountry)}
                aria-describedby={errors.billingCountry ? 'billingCountry-error' : undefined}
              />
            </Field>

            {/* The total, restated beside the button that charges it. */}
            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total today</span>
              <span className="text-lg font-semibold tabular-nums">£{plan.priceGbp}.00</span>
            </div>

            <Button type="submit" className="w-full">
              <Lock className="size-4" aria-hidden />
              Pay £{plan.priceGbp}
            </Button>
          </motion.form>
        ) : phase === 'processing' ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-5 p-5 py-10"
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
            <p className="text-xs text-muted-foreground">This is a simulated payment.</p>
          </motion.div>
        ) : phase === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 p-5 py-8 text-center"
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
            className="flex flex-col items-center gap-4 p-5 py-8 text-center"
            role="alert"
          >
            <XCircle className="size-11 text-danger" aria-hidden />
            <div>
              <p className="font-medium">Payment declined</p>
              <p className="mt-1 text-sm text-muted-foreground">{declineMessage}</p>
            </div>
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => setPhase('form')}>
                Use a different card
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Label, control and error as one unit.
 *
 * The error is wired to the input with `aria-describedby` and announced with
 * `role="alert"`, so it reaches a screen reader rather than only being red —
 * which is also why colour is not carrying the meaning on its own.
 */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint && !error && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Said before the first field, and short enough to actually be read.
 *
 * The button matters more than the prose: a demo where you have to retype a
 * sixteen-digit number out of a paragraph is a demo people abandon halfway.
 */
function DemoNotice({ onFill }: { onFill: () => void }) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-medium">Demo payment — no money moves</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nothing reaches a payment provider and no card details are stored. Do not enter a
            real card.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onFill} className="w-full">
            <Sparkles className="size-3.5" aria-hidden />
            Fill in a test card
          </Button>
          <p className="text-[11px] text-muted-foreground">
            To see a decline, use <code className="font-mono">4000 0000 0000 0002</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
