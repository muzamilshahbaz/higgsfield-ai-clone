'use client'

import { useFormStatus } from 'react-dom'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Small pieces shared by all four auth forms, so the spinner behaviour,
 * error styling and a11y wiring are identical everywhere.
 */

/** Submit button that disables and spins while the action is in flight. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
}: {
  children: React.ReactNode
  pendingLabel: string
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className={cn('w-full', className)} variant={variant} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

/** Form-level error banner. Announced to screen readers when it appears. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

/** Form-level success banner, for the "check your inbox" states. */
export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success"
    >
      <CircleCheck className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

/** Inline message under a single field. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null

  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  )
}
