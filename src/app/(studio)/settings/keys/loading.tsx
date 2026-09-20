import { HeaderSkeleton } from '@/components/studio/page-skeletons'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ProviderKeysLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <HeaderSkeleton title="Settings" />

      <Skeleton className="h-10 w-full rounded-lg" />

      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
