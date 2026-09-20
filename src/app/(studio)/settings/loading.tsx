import { HeaderSkeleton, RowsSkeleton } from '@/components/studio/page-skeletons'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <HeaderSkeleton title="Settings" />

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>

        <Skeleton className="my-6 h-px w-full rounded-none" />

        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="w-full space-y-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>

        <Skeleton className="my-6 h-px w-full rounded-none" />
        <RowsSkeleton count={5} />
      </Card>
    </div>
  )
}
