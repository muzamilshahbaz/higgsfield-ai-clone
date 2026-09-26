import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * The button.
 *
 * The primary variant is cyan with graphite ink — 8.6:1, so it passes AA at
 * every size including the 12px `sm`, which white-on-brand would not. It gets a
 * soft 1px ring of its own colour instead of a coloured drop shadow: on a
 * graphite canvas a glow reads as a smudge, and this reads as an edge catching
 * light.
 *
 * `active:translate-y-px` rather than `active:scale`. Scaling a button scales
 * its text, which on a 12px label is visibly blurry for the 150ms it lasts.
 *
 * Disabled state drops opacity *and* removes the ring, because a dimmed button
 * that still glows looks like it is loading rather than unavailable.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg',
    'text-sm font-medium outline-none',
    'transition-[background-color,border-color,color,box-shadow,translate] duration-150',
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--color-primary-soft)] hover:bg-primary/90 active:translate-y-px',
        /* Coral. For a second action that must not be mistaken for the first —
           never two of these on one screen. */
        accent:
          'bg-accent text-accent-foreground shadow-[0_0_0_1px_var(--color-accent-soft)] hover:bg-accent/90 active:translate-y-px',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-muted active:translate-y-px',
        outline:
          'border border-border bg-surface/40 hover:border-muted hover:bg-surface active:translate-y-px',
        ghost: 'text-muted-foreground hover:bg-surface hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:translate-y-px',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        default: 'h-10 px-4',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
