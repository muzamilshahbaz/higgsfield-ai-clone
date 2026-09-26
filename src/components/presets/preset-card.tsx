'use client'

import Link from 'next/link'
import { Check, Coins, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { getModel } from '@/lib/ai/registry'
import { formatCategory, type PresetSummary } from '@/lib/presets'
import { cn } from '@/lib/utils'

/**
 * One preset tile, shared by the composer's picker and the gallery.
 *
 * The accent colour is decoration only — a wash behind the preview and a hair
 * of border. No text ever sits on it, which is what keeps an arbitrary hex
 * from the catalogue out of the contrast budget.
 */
export function PresetCard({
  preset,
  selected = false,
  onSelect,
  href,
  className,
}: {
  preset: PresetSummary
  selected?: boolean
  /** Picker mode: renders a toggle button. */
  onSelect?: (preset: PresetSummary) => void
  /** Gallery mode: renders a link, so the tile can be opened in a new tab. */
  href?: string
  className?: string
}) {
  const model = getModel(preset.modelId)
  const accent = preset.accent ?? undefined

  const body = (
    <>
      <div
        className="relative aspect-video w-full overflow-hidden bg-surface-2"
        style={accent ? { backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)` } : undefined}
      >
        {preset.posterUrl ? (
          // Not next/image: these are bundled SVG loops, already the right size,
          // and the optimiser cannot process animated SVG anyway.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preset.posterUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
          />
        ) : (
          <div className="size-full bg-surface-2" />
        )}

        {/* Keeps the title legible over any frame. */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />

        {preset.isFeatured && (
          <span className="absolute left-2.5 top-2.5">
            <Badge variant="default" onMedia>
              <Sparkles className="size-3" aria-hidden />
              Featured
            </Badge>
          </span>
        )}

        {selected && (
          <span className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Check className="size-3.5" aria-hidden />
            <span className="sr-only">Selected</span>
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate text-sm font-medium text-foreground">{preset.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {formatCategory(preset.category)} · {model?.label ?? preset.modelId}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3">
        <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
          {preset.description}
        </p>
        {preset.creditCost > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-credit"
            title={`${preset.creditCost} ${preset.creditCost === 1 ? 'credit' : 'credits'} on top of the model price`}
          >
            <Coins className="size-3" aria-hidden />+{preset.creditCost}
          </span>
        )}
      </div>
    </>
  )

  const shell = cn(
    'group block overflow-hidden rounded-xl border bg-card text-left transition-colors',
    selected ? 'border-primary' : 'border-border hover:border-muted',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={shell} aria-label={`Use the ${preset.title} preset`}>
        {body}
      </Link>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      // The tile's own text is decorative markup around a name; spelling the
      // label out keeps the button from being announced as its description.
      aria-label={`${preset.title} — ${formatCategory(preset.category)} preset`}
      onClick={() => onSelect?.(preset)}
      className={cn(shell, 'w-full')}
    >
      {body}
    </button>
  )
}
