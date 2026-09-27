import { KineticMark } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { getSettings } from '@/services/cms/settings.service'

/**
 * The logo, as configured.
 *
 * An async Server Component so every surface that renders a logo picks up the operator's
 * branding without threading props from a layout three levels up. `getSettings` is wrapped in
 * `cache()`, so a page rendering this in the header and again in the footer issues one query
 * rather than two.
 *
 * Three states, in order of preference:
 *
 *   · An uploaded or linked logo, with the wordmark beside it if it is switched on.
 *   · The built-in mark with the configured wordmark text — which is what an operator who has
 *     renamed the site but not replaced the mark gets.
 *   · The built-in mark alone, when the wordmark is switched off.
 *
 * The custom logo is constrained to a height and `object-contain`, so a logo of any aspect
 * ratio fits the furniture rather than stretching it. A wide wordmark-style logo is capped in
 * width too, because the header rail it sits in is 244px.
 */
export async function SiteLogo({
  className,
  markClassName,
  /** Drops the second word of the built-in wordmark. For a rail that cannot fit it. */
  compact = false,
}: {
  className?: string
  markClassName?: string
  compact?: boolean
}) {
  const settings = await getSettings()
  const { logoUrl, wordmarkText, showWordmark } = settings.branding

  if (logoUrl) {
    return (
      <span className={cn('flex items-center gap-2.5', className)}>
        {/*
          A plain <img>, not next/image. The URL is operator-supplied and may point at any
          host; next/image would need that host in `remotePatterns` at build time, which is
          exactly the kind of "change the config and redeploy" this whole feature exists to
          remove. It is one small asset in the page furniture, so the optimisation is not
          worth the constraint.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={showWordmark ? '' : settings.site.name}
          className={cn('h-8 w-auto max-w-[9rem] shrink-0 object-contain', markClassName)}
        />
        {showWordmark && (
          <span className="font-display text-[15px] font-semibold leading-none tracking-tight">
            {wordmarkText}
          </span>
        )}
      </span>
    )
  }

  // The built-in mark. `title` is set only when no visible wordmark accompanies it, so a
  // screen reader does not say the product name twice.
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <KineticMark
        className={cn('size-8 shrink-0', markClassName)}
        title={showWordmark ? undefined : settings.site.name}
      />
      {showWordmark && (
        <span className="font-display text-[15px] font-semibold leading-none tracking-tight">
          {compact ? wordmarkText.split(' ')[0] : wordmarkText}
        </span>
      )}
    </span>
  )
}
