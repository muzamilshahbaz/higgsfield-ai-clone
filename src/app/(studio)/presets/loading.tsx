import { GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function PresetsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <HeaderSkeleton title="Presets" action />

      {/* Filter bar: kind chips on the left, search on the right. */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-16 rounded-lg" aria-hidden />
        <Skeleton className="h-8 w-20 rounded-lg" aria-hidden />
        <Skeleton className="h-8 w-16 rounded-lg" aria-hidden />
        <Skeleton className="ml-auto h-8 w-full rounded-lg sm:w-56" aria-hidden />
      </div>

      <GridSkeleton count={9} />
    </div>
  )
}
