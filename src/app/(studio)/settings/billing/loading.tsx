import { HeaderSkeleton } from '@/components/studio/page-skeletons'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function BillingLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <HeaderSkeleton title="Settings" />

      <Skeleton className="h-10 w-full rounded-lg" />

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </Card>

      <Card className="p-6">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-3.5 w-72" />
          ))}
        </div>
      </Card>
    </div>
  )
}
