'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
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
 * How Explore is narrowed down.
 *
 * The categories are a horizontal rail rather than a wrapping row of chips:
 * twelve of them wrap to three lines on a phone and push the actual feed below
 * the fold, which is the one thing a discovery page cannot afford. `.rail`
 * (globals.css) gives it snap points and hides the scrollbar while leaving the
 * keyboard flow intact.
 *
 * Sort is a select rather than a second segmented control. Four options next
 * to twelve categories would read as one very long filter bar with no
 * hierarchy, and sort is the choice people change least.
 */
export function ExploreFilters({
  category,
  onCategoryChange,
  sort,
  onSortChange,
  search,
  onSearchChange,
  resultCount,
  loading,
}: {
  category: string
  onCategoryChange: (category: string) => void
  sort: ExploreSort
  onSortChange: (sort: ExploreSort) => void
  search: string
  onSearchChange: (search: string) => void
  resultCount: number
  loading: boolean
}) {
  const searchId = React.useId()

  // "Trending" *is* a sort, so the sort control is redundant while it is
  // selected and says so rather than silently disagreeing with the feed.
  const sortLockedByCategory = category === 'trending'

  return (
    <div className="space-y-3">
      <div
        className="rail -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
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
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                // Cyan ink on a cyan tint with a cyan border: three signals, so
                // the chosen tab survives a greyscale screen.
                active
                  ? 'border-primary/50 bg-primary/15 text-brand'
                  : 'border-border bg-surface/40 text-muted-foreground hover:border-muted hover:bg-surface hover:text-foreground',
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {entry.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/40 p-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor={searchId} className="sr-only">
            Search prompts, creators and tags
          </label>
          <Input
            id={searchId}
            type="search"
            value={search}
            placeholder="Search prompts, creators, tags"
            className="h-8 bg-background/60 pl-8 pr-8 text-xs"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear the search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="explore-sort" className="sr-only">
            Sort the feed
          </label>
          <Select
            value={sort}
            onValueChange={(next) => onSortChange(next as ExploreSort)}
            disabled={sortLockedByCategory}
          >
            <SelectTrigger id="explore-sort" className="h-8 w-[11rem] text-xs">
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

      <p role="status" className="text-xs text-muted-foreground">
        {loading ? (
          'Loading…'
        ) : sortLockedByCategory ? (
          <>
            {resultCount} {resultCount === 1 ? 'shot' : 'shots'} · ranked by engagement this month
          </>
        ) : (
          <>
            {resultCount} {resultCount === 1 ? 'shot' : 'shots'} ·{' '}
            {EXPLORE_SORT_LABELS[sort].toLowerCase()}
          </>
        )}
      </p>
    </div>
  )
}
