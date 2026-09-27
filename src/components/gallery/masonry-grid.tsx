import { cn } from '@/lib/utils'

/**
 * The library's grid.
 *
 * CSS columns rather than a row grid, because generations come in five aspect
 * ratios and a fixed-row grid either crops a 9:16 clip or leaves a 21:9 one
 * swimming in dead space. Reading order stays newest-first in the DOM, which
 * is what the keyboard and a screen reader follow.
 *
 * Two densities. `panel` is the studio default, sized for a grid that sits
 * beside a 272px sidebar. `wide` is for the standalone Explore page, which has
 * the whole viewport and would otherwise show four very large cards on a
 * monitor — a discovery surface wants more per screen, and tighter gaps, than
 * a working library does.
 *
 * Both are container queries, not viewport breakpoints, so a grid nested in a
 * narrower column still lays itself out correctly.
 */
export function MasonryGrid({
  children,
  className,
  density = 'panel',
}: {
  children: React.ReactNode
  className?: string
  density?: 'panel' | 'wide'
}) {
  return (
    <div
      className={cn(
        density === 'wide'
          ? 'columns-1 gap-5 @md:columns-2 @3xl:columns-3 @5xl:columns-4 @7xl:columns-5 [&>*]:mb-5'
          : 'columns-1 gap-4 @xl:columns-2 @4xl:columns-3 @6xl:columns-4 [&>*]:mb-4',
        // Without this a card can be split across a column boundary.
        '[&>*]:break-inside-avoid',
        className,
      )}
    >
      {children}
    </div>
  )
}
