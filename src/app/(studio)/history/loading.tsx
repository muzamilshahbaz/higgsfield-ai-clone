import { HeaderSkeleton, RowsSkeleton } from '@/components/studio/page-skeletons'

export default function HistoryLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton />
      <RowsSkeleton count={8} />
    </div>
  )
}
