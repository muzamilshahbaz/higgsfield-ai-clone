import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The shared "nothing here yet" panel. Every list surface uses it, so an empty
 * library and an empty project read the same way and neither looks broken.
 *
 * A dashed border over a blueprint wash rather than a solid card: an empty
 * state that looks exactly like a full one makes a user wonder whether their
 * data failed to load. Dashes say "this is where things go".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  headingLevel = 2,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
  /**
   * Where this panel sits in the page's outline.
   *
   * It used to be a hard-coded `h3`, which on a surface whose only other
   * heading is the page `h1` skipped a level — a real failure, not a
   * technicality: a screen reader's heading list implies a missing section
   * that is not there. Callers nested under a section heading pass 3 or 4.
   */
  headingLevel?: 2 | 3 | 4
}) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      <div className="blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>

      <Heading className="relative mt-4 font-display text-[15px] font-medium">{title}</Heading>
      <p className="relative mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      {action && <div className="relative mt-6">{action}</div>}
    </div>
  )
}
