import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * The card.
 *
 * Built on the `.panel` utility, so every card in the app carries the same 1px
 * highlight along its top edge — the one treatment that separates a surface
 * from the graphite canvas without a heavy shadow. A card is therefore a panel
 * with padding conventions, not a second look.
 *
 * `interactive` adds the hover state for a card that is a link or a button. It
 * is opt-in: a card that lifts on hover but does nothing when clicked is the
 * most common lie in a dark UI.
 */
function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'panel rounded-xl text-card-foreground',
        interactive && 'transition-colors hover:border-muted hover:bg-surface-2/40',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-display text-base font-medium leading-none', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-5 pt-0', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center p-5 pt-0', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
