'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

/**
 * The composer's one-line choosers: task, aspect ratio, duration.
 *
 * Exposed as a radio group rather than a row of buttons, with the keyboard
 * behaviour that name promises: one tab stop for the whole group (roving
 * tabindex), and arrow keys moving the selection, wrapping at both ends and
 * stepping over disabled options.
 */
export function Segmented<T extends string | number>({
  name,
  value,
  options,
  onChange,
  className,
  size = 'default',
}: {
  name: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  size?: 'default' | 'sm'
}) {
  const groupRef = React.useRef<HTMLDivElement>(null)

  const selectable = options.filter((option) => !option.disabled)
  const focusedIsSelected = options.some((option) => option.value === value && !option.disabled)

  /** Moves selection by `step`, skipping disabled options and wrapping. */
  const move = (step: number) => {
    if (selectable.length === 0) return

    const currentIndex = selectable.findIndex((option) => option.value === value)
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + step + selectable.length) % selectable.length

    const next = selectable[nextIndex]!
    onChange(next.value)

    // Follow the selection with focus, the way a native radio group does.
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(String(next.value))}"]`)
      ?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={name}
      className={cn('flex flex-wrap gap-1.5', className)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault()
          move(1)
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          move(-1)
        }
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            data-value={String(option.value)}
            aria-checked={selected}
            // Exactly one button is tabbable: the selected one, or the first
            // usable one when the current value is not selectable.
            tabIndex={selected || (!focusedIsSelected && index === 0) ? 0 : -1}
            disabled={option.disabled}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg border text-sm font-medium transition-colors',
              size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3',
              'focus-visible:border-ring focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? 'border-primary/60 bg-primary/15 text-foreground'
                : 'border-border bg-surface/50 text-muted-foreground hover:border-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
