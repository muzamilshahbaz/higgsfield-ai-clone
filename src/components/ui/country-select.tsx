'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronDown, Search } from 'lucide-react'

import { COUNTRIES, countryName, flagSrc, getCountry, matchesCountry } from '@/lib/countries'
import { cn } from '@/lib/utils'

/**
 * A searchable country picker.
 *
 * Built from `cmdk` inside a Radix Popover rather than a packaged dropdown:
 * every ready-made country component either ships its own CSS-in-JS runtime
 * (react-select pulls Emotion) or has not been published in years, and either
 * way it would not look like the rest of this application. `cmdk` is the same
 * primitive shadcn's Combobox uses and it is built on Radix, which this app
 * already depends on.
 *
 * `cmdk` owns the keyboard contract — arrow keys, Home/End, Enter, typeahead —
 * and the `role="option"` / `aria-selected` wiring. Filtering is ours, because
 * the default only matches the rendered label and we want "UK" to find the
 * United Kingdom.
 *
 * The value in and out is always the ISO 3166-1 alpha-2 code. The name and the
 * flag are display, derived from it.
 */

interface CountrySelectProps {
  /** ISO 3166-1 alpha-2. */
  value: string
  onChange: (code: string) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  'aria-describedby'?: string
}

export function CountrySelect({
  value,
  onChange,
  id,
  disabled,
  invalid,
  'aria-describedby': describedBy,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  // `role="combobox"` is only half a contract without `aria-controls`: a
  // screen reader has to be able to find the list the control expands.
  const listboxId = React.useId()

  const selected = getCountry(value)

  const results = React.useMemo(
    () => COUNTRIES.filter((c) => matchesCountry(c, query)),
    [query],
  )

  // The query is per-opening: reopening the list to change your mind should
  // not start you inside the last search.
  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm',
            'border-border bg-surface text-foreground transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-danger',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <Flag code={selected.code} />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Choose a country</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          // Matches the trigger so the list never looks detached from it, and
          // never wider than the viewport on a phone.
          className={cn(
            'z-[60] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg',
            'border border-border bg-popover text-popover-foreground shadow-2xl',
            'menu-pop',
          )}
        >
          <Command shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border/60 px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search countries"
                className={cn(
                  'h-9 w-full bg-transparent text-sm outline-none',
                  'placeholder:text-muted-foreground',
                )}
              />
            </div>

            <Command.List
              id={listboxId}
              className="max-h-60 overflow-y-auto overscroll-contain p-1"
            >
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                No country matches “{query}”.
              </Command.Empty>

              {results.map((country) => (
                <Command.Item
                  key={country.code}
                  // The code is the value cmdk reports, so selection never
                  // depends on how the name happens to be spelled.
                  value={country.code}
                  onSelect={(code) => {
                    onChange(code.toUpperCase())
                    setOpen(false)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                    'text-foreground outline-none',
                    'data-[selected=true]:bg-surface-2',
                  )}
                >
                  <Flag code={country.code} />
                  <span className="min-w-0 flex-1 truncate">{country.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {country.code}
                  </span>
                  {country.code === value && (
                    <Check className="size-4 shrink-0 text-brand" aria-hidden />
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * One flag.
 *
 * A plain `<img>` rather than `next/image`: these are 820-byte same-origin
 * SVGs, so the optimiser has nothing to optimise and would add a request
 * through `/_next/image` for each one. `loading="lazy"` is what keeps a
 * 250-row list from fetching 250 files.
 *
 * `alt=""` because the country name sits next to it — announcing the flag as
 * well would read the country twice.
 */
function Flag({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={flagSrc(code)}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      decoding="async"
      className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-border/60"
    />
  )
}

/** The flag and name for a stored code, for read-only surfaces. */
export function CountryLabel({ code, className }: { code: string; className?: string }) {
  const country = getCountry(code)
  if (!country) return <span className={className}>{countryName(code)}</span>

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Flag code={country.code} />
      {country.name}
    </span>
  )
}
