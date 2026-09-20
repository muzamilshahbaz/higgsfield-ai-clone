import { GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'

export default function ExploreLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton title="Explore" />
      <GridSkeleton count={9} />
    </div>
  )
}
