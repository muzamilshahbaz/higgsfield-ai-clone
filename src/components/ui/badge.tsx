import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * The badge.
 *
 * Squared off to a 6px radius rather than a pill. On a dark UI full of rounded
 * controls, a pill badge reads as a button you can press; a rectangle reads as
 * a label, which is what this is.
 *
 * Every variant is a tinted background under the *ink* half of a colour pair —
 * `text-brand` not `text-primary`, `text-danger` not `text-destructive` —
 * because a fill colour used as type on its own tint fails contrast every time.
 */
const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-5 transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-brand',
        accent: 'border-transparent bg-accent/15 text-accent',
        secondary: 'border-transparent bg-surface-2 text-muted-foreground',
        outline: 'border-border bg-background/60 text-muted-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        destructive: 'border-transparent bg-destructive/15 text-danger',
        credit: 'border-transparent bg-credit/15 text-credit tabular-nums',
      },
      /**
       * For a badge sitting on top of a photograph or a video frame.
       *
       * The tinted backgrounds above are 15% of a colour over whatever is
       * behind them, which is fine on a graphite panel and unreadable on a
       * bright sky — cyan at 15% over white leaves cyan text on white. This
       * replaces the tint with a near-opaque graphite plate and keeps the ink,
       * so the same variant stays legible over any frame.
       */
      onMedia: {
        true: 'bg-background/85 backdrop-blur-sm',
        false: '',
      },
    },
    defaultVariants: { variant: 'default', onMedia: false },
  },
)

function Badge({
  className,
  variant,
  onMedia,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, onMedia }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
