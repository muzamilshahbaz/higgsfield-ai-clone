import { Skeleton } from '@/components/ui/skeleton'

/**
 * Auth form loader. Matches the heading + three-field + button rhythm of the
 * sign-in and sign-up forms, inside the same split shell.
 */
export default function AuthLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      <Skeleton className="mx-auto h-4 w-48" />
    </div>
  )
}
