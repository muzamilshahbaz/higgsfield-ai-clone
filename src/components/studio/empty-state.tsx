import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The shared "nothing here yet" panel. Every list surface uses it, so an empty
 * library and an empty project read the same way and neither looks broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>

      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>

      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
