'use client'

import * as React from 'react'
import { Loader2, Search, X } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EXPLORE_CATEGORIES } from '@/lib/categories'
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, type ExploreSort } from '@/lib/explore'
import { cn } from '@/lib/utils'

/**
 * Explore's search box.
 *
 * Sits in the hero rather than in a toolbar, because on a discovery page the
 * search field is the primary control and a page that opens with a 32px input
 * tucked beside a sort dropdown is a page that expects you to browse. This one
 * expects you to look for something.
 *
 * Kept separate from the chip rail so the server page can place the heading,
 * the lead and this input as one composition, while the rail and the grid
 * stay together below.
 */
export function ExploreSearch({
  value,
  onChange,
  loading,
}: {
  value: string
  onChange: (value: string) => void
  loading: boolean
}) {
  const id = React.useId()

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <label htmlFor={id} className="sr-only">
        Search prompts, creators, categories and models
      </label>

      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />

      <input
        id={id}
        type="search"
        value={value}
        placeholder="Search prompts, creators, models…"
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-12 w-full rounded-xl border border-input bg-surface/60 pl-11 pr-11 text-sm',
          'placeholder:text-muted-foreground',
          'transition-colors hover:border-muted focus:border-primary/60',
          // The browser's own clear button sits on top of ours and looks
          // nothing like it.
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />

      {/* One slot, two states: a spinner while a query is in flight, a clear
          button otherwise. They never both apply, so they share the position
          rather than fighting over it. */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          value && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear the search"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          )
        )}
      </div>
    </div>
  )
}

/**
 * The category rail and the sort control.
 *
 * The categories are a horizontal rail rather than a wrapping row of chips:
 * fifteen of them wrap to three lines on a phone and push the actual feed
 * below the fold, which is the one thing a discovery page cannot afford.
 * `.rail` (globals.css) gives it snap points and hides the scrollbar while
 * leaving the keyboard flow intact.
 *
 * Sort is a select rather than a second row of chips. Five options next to
 * fifteen categories would read as one very long filter bar with no
 * hierarchy, and sort is the choice people change least.
 */
export function ExploreFilters({
  category,
  onCategoryChange,
  sort,
  onSortChange,
  resultCount,
  hasMore,
  loading,
}: {
  category: string
  onCategoryChange: (category: string) => void
  sort: ExploreSort
  onSortChange: (sort: ExploreSort) => void
  resultCount: number
  hasMore: boolean
  loading: boolean
}) {
  // "Trending" *is* a sort, so the sort control is redundant while it is
  // selected and says so rather than silently disagreeing with the feed.
  const sortLockedByCategory = category === 'trending'

  return (
    <div className="space-y-4">
      <div
        className="rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Browse by category"
      >
        {EXPLORE_CATEGORIES.map((entry) => {
          const Icon = entry.icon
          const active = entry.slug === category

          return (
            <button
              key={entry.slug}
              type="button"
              role="tab"
              aria-selected={active}
              title={entry.description}
              onClick={() => onCategoryChange(entry.slug)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium',
                'transition-[color,background-color,border-color,transform] duration-200',
                // Cyan ink on a cyan tint with a cyan border: three signals, so
                // the chosen tab survives a greyscale screen.
                active
                  ? 'border-primary/50 bg-primary/15 text-brand'
                  : 'border-border bg-surface/40 text-muted-foreground hover:-translate-y-px hover:border-muted hover:bg-surface hover:text-foreground',
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {entry.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Loading…
            </span>
          ) : (
            <>
              {resultCount}
              {hasMore ? '+' : ''} {resultCount === 1 ? 'creation' : 'creations'}
              {' · '}
              {sortLockedByCategory
                ? 'ranked by engagement this month'
                : EXPLORE_SORT_LABELS[sort].toLowerCase()}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <label htmlFor="explore-sort" className="text-xs text-muted-foreground">
            Sort
          </label>
          <Select
            value={sort}
            onValueChange={(next) => onSortChange(next as ExploreSort)}
            disabled={sortLockedByCategory}
          >
            <SelectTrigger id="explore-sort" className="h-9 w-[11.5rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPLORE_SORTS.map((value) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {EXPLORE_SORT_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
