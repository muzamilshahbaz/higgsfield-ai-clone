import { cn } from '@/lib/utils'

/**
 * The loading placeholder.
 *
 * A shimmer over a surface tint rather than a pulsing block: a pulse changes
 * the whole element's opacity, which on a page of six skeletons reads as the
 * page itself flickering. The sweep moves through them instead.
 *
 * `shimmer` is defined in globals.css and removes itself under reduced motion
 * via the global rule there.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('shimmer rounded-lg bg-surface-2/50', className)}
      {...props}
    />
  )
}

export { Skeleton }
