'use client'

import * as React from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'

import { PresetCard } from '@/components/presets/preset-card'
import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  categoriesOf,
  formatCategory,
  matchesQuery,
  PRESET_KIND_LABELS,
  type PresetSummary,
} from '@/lib/presets'
import { cn } from '@/lib/utils'
import type { PresetKind } from '@/types/database'

/**
 * Filter bar + grid over the preset catalogue.
 *
 * The composer's picker and the /presets gallery are the same browsing problem
 * — 36 presets across two kinds and several categories — so they are the same
 * component, differing only in how a tile is activated: `onSelect` makes the
 * tiles toggle buttons, `hrefFor` makes them links.
 */

const ALL = '__all__' as const
type KindFilter = PresetKind | typeof ALL

export function PresetBrowser({
  presets,
  selectedId,
  onSelect,
  hrefFor,
  initialKind,
  columns = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  className,
}: {
  presets: PresetSummary[]
  selectedId?: string | null
  onSelect?: (preset: PresetSummary) => void
  hrefFor?: (preset: PresetSummary) => string
  /** Opens on one kind — the picker uses the kind matching the current task. */
  initialKind?: KindFilter
  columns?: string
  className?: string
}) {
  const [kind, setKind] = React.useState<KindFilter>(initialKind ?? ALL)
  const [category, setCategory] = React.useState<string>(ALL)
  const [query, setQuery] = React.useState('')

  const searchId = React.useId()

  // Categories belong to the chosen kind: "camera" is meaningless under Style.
  const withinKind = React.useMemo(
    () => (kind === ALL ? presets : presets.filter((preset) => preset.kind === kind)),
    [presets, kind],
  )

  const categories = React.useMemo(() => categoriesOf(withinKind), [withinKind])

  // A category that the new kind does not have would filter everything away.
  React.useEffect(() => {
    setCategory((current) => (current === ALL || categories.includes(current) ? current : ALL))
  }, [categories])

  const visible = React.useMemo(
    () =>
      withinKind.filter(
        (preset) =>
          (category === ALL || preset.category === category) && matchesQuery(preset, query),
      ),
    [withinKind, category, query],
  )

  const filtered = kind !== ALL || category !== ALL || query.trim() !== ''

  const kindOptions: SegmentedOption<KindFilter>[] = [
    { value: ALL, label: 'All' },
    { value: 'motion', label: PRESET_KIND_LABELS.motion },
    { value: 'style', label: PRESET_KIND_LABELS.style },
  ]

  const categoryOptions: SegmentedOption<string>[] = [
    { value: ALL, label: 'All' },
    ...categories.map((value) => ({ value, label: formatCategory(value) })),
  ]

  const reset = () => {
    setKind(ALL)
    setCategory(ALL)
    setQuery('')
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented name="Preset kind" size="sm" value={kind} options={kindOptions} onChange={setKind} />

          <div className="relative ml-auto w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor={searchId} className="sr-only">
              Search presets
            </label>
            <Input
              id={searchId}
              type="search"
              value={query}
              placeholder="Search presets"
              className="h-8 pl-8 text-xs"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {categoryOptions.length > 2 && (
          <Segmented
            name="Preset category"
            size="sm"
            value={category}
            options={categoryOptions}
            onChange={setCategory}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {visible.length} {visible.length === 1 ? 'preset' : 'presets'}
        </p>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No presets match"
          description="Nothing in the catalogue fits those filters. Widen the search or clear them."
          action={
            <Button variant="outline" onClick={reset}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className={cn('grid gap-3', columns)}>
          {visible.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              selected={preset.id === selectedId}
              onSelect={onSelect}
              href={hrefFor?.(preset)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
