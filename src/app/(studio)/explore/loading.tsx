import { FiltersSkeleton, GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'

export default function ExploreLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton title="Explore" />

      <div className="space-y-5">
        <FiltersSkeleton />
        <GridSkeleton count={9} />
      </div>
    </div>
  )
}
