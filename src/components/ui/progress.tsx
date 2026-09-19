import { cn } from '@/lib/utils'

/**
 * Determinate progress bar for a running job.
 *
 * `value` is 0..1 to match the `progress` column and the provider port, so no
 * caller has to remember which of the two scales this one uses.
 */
export function Progress({
  value,
  className,
  label,
}: {
  value: number
  className?: string
  label?: string
}) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  const percent = Math.round(clamped * 100)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label ?? 'Generation progress'}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-out-expo)]"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
