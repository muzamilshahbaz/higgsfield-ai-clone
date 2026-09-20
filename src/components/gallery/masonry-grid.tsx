import { cn } from '@/lib/utils'

/**
 * The library's grid.
 *
 * CSS columns rather than a row grid, because generations come in five aspect
 * ratios and a fixed-row grid either crops a 9:16 clip or leaves a 21:9 one
 * swimming in dead space. Reading order stays newest-first in the DOM, which
 * is what the keyboard and a screen reader follow.
 */
export function MasonryGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'columns-1 gap-4 @xl:columns-2 @4xl:columns-3 @6xl:columns-4 [&>*]:mb-4',
        // Without this a card can be split across a column boundary.
        '[&>*]:break-inside-avoid',
        className,
      )}
    >
      {children}
    </div>
  )
}
