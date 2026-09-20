import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading skeletons.
 *
 * Each one mirrors the shape of the page it stands in for — same heading
 * block, same grid, same card heights — so the swap to real content does not
 * shift the layout under the reader's eye.
 */

/**
 * Heading + subtitle block that every studio page opens with.
 *
 * `title` is not decoration. Without it the loading state is a page of grey
 * rectangles with no heading and nothing to announce — a screen reader lands
 * on silence, and an automated audit correctly reports a page with no `h1`.
 * The real page renders its own visible `h1` a moment later.
 */
export function HeaderSkeleton({ action = false, title }: { action?: boolean; title: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="sr-only">{title}</h1>
        <p role="status" className="sr-only">
          Loading {title.toLowerCase()}…
        </p>
        <Skeleton className="h-7 w-56" aria-hidden />
        <Skeleton className="h-4 w-72" aria-hidden />
      </div>
      {action && <Skeleton className="h-10 w-40 rounded-lg" aria-hidden />}
    </div>
  )
}

/** The dashboard's three stat tiles. */
export function StatsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="flex items-center gap-4 p-5">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="w-full space-y-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Stand-in for a panel of content, sized like the empty states it replaces. */
export function PanelSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-64 w-full rounded-xl', className)} />
}

/** A masonry-ish grid of media cards, for library/explore/projects. */
export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className="aspect-video w-full rounded-xl"
          // Staggered so the shimmer reads as a wave rather than one flat block.
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  )
}

/** Rows for the history table. */
export function RowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className="h-14 w-full rounded-lg"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  )
}
