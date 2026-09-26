import * as React from 'react'

import { cn } from '@/lib/utils'

/** The multi-line input. Same focus and invalid contract as `Input`. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex w-full rounded-lg border border-input bg-surface/50 px-3 py-2.5 text-sm leading-relaxed',
        'placeholder:text-muted-foreground/60',
        'resize-none transition-colors focus-visible:border-ring focus-visible:bg-surface-2/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:bg-destructive/5',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
