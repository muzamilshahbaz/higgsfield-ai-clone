'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface/50 px-3 text-sm',
        'transition-colors hover:border-muted focus-visible:border-ring focus-visible:bg-surface-2/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        "[&>span]:min-w-0 [&>span]:truncate [&>span]:text-left",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={6}
        className={cn(
          'relative z-50 max-h-80 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lift',
          // `menu-pop` is defined in globals.css — tailwindcss-animate is not
          // a dependency, so the one enter animation we need lives there.
          'origin-[var(--radix-select-content-transform-origin)] menu-pop',
          position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

/**
 * `hint` is deliberately rendered outside ItemText: Radix mirrors ItemText
 * into the closed trigger, so a two-line item would make the trigger two lines
 * tall. The hint belongs to the open list only.
 */
function SelectItem({
  className,
  children,
  hint,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & { hint?: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-pointer select-none flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 pr-8 text-sm outline-none',
        'data-[highlighted]:bg-surface-2 data-[state=checked]:text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 top-2.5">
        <Check className="size-4 text-brand" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
