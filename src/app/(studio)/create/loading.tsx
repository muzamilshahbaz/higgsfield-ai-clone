import { HeaderSkeleton } from '@/components/studio/page-skeletons'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The composer is the heaviest surface in the product, so it gets a loader
 * shaped like the real thing: preset rail, canvas, then the composer bar.
 */
export default function CreateLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton />

      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton
            key={i}
            className="aspect-[3/4] w-32 shrink-0 rounded-xl"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  )
}
