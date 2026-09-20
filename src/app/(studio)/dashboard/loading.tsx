import {
  HeaderSkeleton,
  PanelSkeleton,
  StatsSkeleton,
} from '@/components/studio/page-skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton action title="Dashboard" />
      <StatsSkeleton />

      <section className="space-y-4">
        <Skeleton className="h-4 w-36" />
        <PanelSkeleton />
      </section>
    </div>
  )
}
