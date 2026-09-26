'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Small pieces shared by all four auth forms, so the spinner behaviour,
 * error styling and a11y wiring are identical everywhere.
 */

/**
 * Field errors that clear when the user fixes the field.
 *
 * A Server Action error is a snapshot of one submission. `useActionState` keeps
 * that snapshot until the next submit, so a password rejected for "add an
 * uppercase letter" goes on saying so while the user types a perfectly good
 * password — and, since the live checklist beside it has already gone green,
 * the form ends up contradicting itself.
 *
 * Dismissal is scoped to the state object that produced the error. A new
 * submission is a new `state` identity, so its errors show again even for a
 * field dismissed a moment earlier; nothing has to be reset by hand.
 */
export function useFieldErrors(state: { fieldErrors?: Record<string, string> }) {
  const [dismissed, setDismissed] = React.useState<{
    owner: typeof state
    fields: ReadonlySet<string>
  }>(() => ({ owner: state, fields: new Set() }))

  const live = dismissed.owner === state ? dismissed.fields : EMPTY

  return {
    /** The error to render for a field, or undefined once it has been edited. */
    errorFor: (name: string) => (live.has(name) ? undefined : state.fieldErrors?.[name]),
    /** Call from the field's onChange. */
    onEdit: (name: string) =>
      setDismissed((prev) =>
        prev.owner === state
          ? { owner: state, fields: new Set(prev.fields).add(name) }
          : { owner: state, fields: new Set([name]) },
      ),
  }
}

const EMPTY: ReadonlySet<string> = new Set()

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
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-danger"
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
    <p id={id} className="text-xs text-danger">
      {message}
    </p>
  )
}
