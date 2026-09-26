'use client'

import { Check, Circle } from 'lucide-react'

import { PASSWORD_RULES } from '@/lib/validation/auth'
import { cn } from '@/lib/utils'

/**
 * The password rules, ticking off as they are met.
 *
 * Five rules is too many for a single error message. The schema can only name
 * the first one a password fails, so without this a user fixes the length, is
 * told about the uppercase, fixes that, is told about the digit — five round
 * trips to learn a policy that fits on four lines.
 *
 * Deliberately not a strength meter. "Weak / medium / strong" is a guess
 * dressed as a measurement, and it cannot tell a user why the server refused
 * them. These are the actual rules Supabase enforces.
 *
 * `aria-live` is off on purpose. The list is right below the field and updates
 * on every keystroke; announcing each change would talk over someone typing.
 * The list is readable on demand, and the submitted form still returns a real
 * field error that *is* announced.
 */
export function PasswordChecklist({
  value,
  className,
  id,
}: {
  value: string
  className?: string
  /** So a password field can point `aria-describedby` at the rules. */
  id?: string
}) {
  // Nothing typed yet: the rules read as requirements rather than failures.
  const pristine = value.length === 0

  return (
    <ul id={id} className={cn('grid gap-1.5 sm:grid-cols-2', className)}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value)

        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              met ? 'text-success' : pristine ? 'text-muted-foreground' : 'text-muted-foreground',
            )}
          >
            {met ? (
              <Check className="size-3 shrink-0" aria-hidden />
            ) : (
              <Circle className="size-3 shrink-0 opacity-40" aria-hidden />
            )}
            {/* The tick is colour plus a shape change, so the state survives a
                greyscale screen; the text says it too for a screen reader. */}
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' — met' : ' — not yet met'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
