import { cn } from '@/lib/utils'

/**
 * The Kinetic Studio mark.
 *
 * Three slats leaning forward out of a rounded square: a shutter opening, or a
 * frame in motion, depending on how long you look at it. The top two are cyan
 * and the trailing one is coral — the same fill/mark split the rest of the
 * system uses, so the logo is an example of the colour rule rather than an
 * exception to it.
 *
 * Drawn on a 32-unit grid with 3.5-unit slats and a 2.5-unit gap, which is the
 * coarsest it can be and still resolve at 16px in a browser tab. Colours come
 * from Tailwind fill utilities rather than hardcoded hex, so the mark follows
 * the tokens if the tokens ever move.
 *
 * `title` is opt-in. The header pairs the mark with a visible wordmark, and a
 * duplicate accessible name there would have a screen reader say the product
 * name twice; the favicon and the collapsed sidebar need it.
 */
export function KineticMark({
  className,
  title,
}: {
  className?: string
  /** Accessible name. Omit when a visible wordmark sits beside the mark. */
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}

      {/* The plate. Radius 8 on a 32 grid is the same medium curve as a card. */}
      <rect width="32" height="32" rx="8" className="fill-surface-2" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        className="fill-none stroke-border"
        strokeWidth="1"
      />

      {/*
        Three slats sheared 18° to the right. Lengths step down front to back so
        the eye reads a direction of travel rather than three parallel bars.
      */}
      <g transform="skewX(-18) translate(4.5 0)">
        <rect x="6" y="8" width="3.5" height="16" rx="1.75" className="fill-primary" />
        <rect x="12" y="10" width="3.5" height="12" rx="1.75" className="fill-primary/55" />
        <rect x="18" y="12.5" width="3.5" height="7" rx="1.75" className="fill-accent" />
      </g>
    </svg>
  )
}

/**
 * Mark plus wordmark.
 *
 * "Kinetic" carries the weight and "Studio" sits back in muted — the product is
 * called both, and setting them at one weight makes a nine-character logo read
 * as a sentence. `compact` drops the second word for the places that genuinely
 * cannot fit it, like a mobile header beside a credit balance.
 */
export function KineticLogo({
  className,
  compact = false,
  markClassName,
}: {
  className?: string
  compact?: boolean
  markClassName?: string
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <KineticMark className={cn('size-8 shrink-0', markClassName)} />
      <span className="font-display text-[15px] font-semibold leading-none tracking-tight">
        Kinetic
        {!compact && <span className="ml-1 font-normal text-muted-foreground">Studio</span>}
      </span>
    </span>
  )
}
