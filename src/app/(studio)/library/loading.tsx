import { GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'

export default function LibraryLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton />
      <GridSkeleton count={9} />
    </div>
  )
}
