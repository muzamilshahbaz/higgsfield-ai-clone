import { cn } from '@/lib/utils'

/**
 * The studio page header.
 *
 * Every surface inside the shell opens the same way: a mono eyebrow naming the
 * area, a display-face title, one line of description, and an optional action
 * on the right. Before this existed each page hand-rolled the same three
 * elements, and they had drifted — three different heading sizes and two
 * different gaps between title and description across seven pages.
 *
 * `eyebrow` is the section, not a repeat of the title: "Content" over
 * "Library", not "Library" over "Library".
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  /** A button or link, placed opposite the title on wide screens. */
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <p className="eyebrow text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
