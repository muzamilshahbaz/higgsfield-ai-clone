import { Reveal } from '@/components/marketing/reveal'
import { cn } from '@/lib/utils'

/**
 * The section header, used by every band on the landing page.
 *
 * Left-aligned with a numbered mono eyebrow above a cyan rule: the page reads
 * as a spec sheet you scroll through rather than a stack of centred pitches.
 * The number is passed in rather than counted, because a section that moves
 * should keep whatever number the copy refers to.
 *
 * `align="center"` exists for the two bands that genuinely want it — pricing
 * and the closing CTA — so those do not each reinvent a centred heading.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  lead,
  align = 'start',
  className,
  action,
}: {
  /** Two-digit section number, e.g. "03". */
  index: string
  eyebrow: string
  title: React.ReactNode
  lead?: React.ReactNode
  align?: 'start' | 'center'
  className?: string
  /** A link or button that sits opposite the heading on wide screens. */
  action?: React.ReactNode
}) {
  const centred = align === 'center'

  return (
    <Reveal>
      <div
        className={cn(
          'flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between',
          centred && 'sm:flex-col sm:items-center',
          className,
        )}
      >
        <div className={cn('max-w-2xl', centred && 'mx-auto text-center')}>
          <p
            className={cn(
              'eyebrow flex items-center gap-3 text-muted-foreground',
              centred && 'justify-center',
            )}
          >
            <span className="text-brand">{index}</span>
            <span className="h-px w-8 bg-border" aria-hidden />
            {eyebrow}
          </p>

          <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.1] sm:text-4xl">
            {title}
          </h2>

          {lead && (
            <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted-foreground">
              {lead}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </Reveal>
  )
}

/**
 * A section wrapper that owns the vertical rhythm and the top seam.
 *
 * Every band gets the same 1px divider and the same padding, so alternating a
 * tinted background or a wider grid is the only thing a section decides for
 * itself. Passing `tinted` lifts the background one step up the graphite ramp.
 */
export function Section({
  id,
  children,
  className,
  tinted = false,
  seam = true,
}: {
  id?: string
  children: React.ReactNode
  className?: string
  tinted?: boolean
  /** The cyan streak at the top edge. Off for bands that follow a dark one. */
  seam?: boolean
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative scroll-mt-20 border-t border-border/70 py-20 sm:py-28',
        tinted && 'bg-surface/40',
        className,
      )}
    >
      {/* The streak sits on the divider, 1/3 across, so the seams do not line
          up vertically as you scroll — it reads as travel rather than trim. */}
      {seam && (
        <span
          className="streaks pointer-events-none absolute left-[8%] top-0 h-2.5 w-40 sm:w-64"
          aria-hidden
        />
      )}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}
