import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * The text input.
 *
 * Focus moves the border to cyan *and* lifts the background a step, so the
 * focused field is obvious even to someone who cannot see the hue change. The
 * global `:focus-visible` ring in globals.css sits outside that, for keyboard
 * users.
 *
 * `aria-invalid` drives the error styling rather than a prop, so a field is red
 * exactly when a screen reader is told it is invalid — the two cannot drift.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-surface/50 px-3 py-2 text-sm',
        'placeholder:text-muted-foreground/60',
        'transition-colors focus-visible:border-ring focus-visible:bg-surface-2/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'aria-invalid:border-destructive aria-invalid:bg-destructive/5',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
