'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

/**
 * The switch.
 *
 * Distinct from a checkbox on purpose: a checkbox is a value you submit, a switch
 * is a state that takes effect. Everywhere it appears in the admin panel it saves
 * on change, which is why the `on` state is cyan — the same colour as every other
 * "this is live" signal in the product — and why there is no separate Save button
 * beside one.
 *
 * The track is 36×20 with a 16px thumb, so the hit area clears the 24px minimum
 * without the control looking like a toy. `peer` is declared so a label beside it
 * can style itself from the state, which is how the flag rows dim their
 * description when a feature is off.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
        'border border-transparent transition-colors',
        // Off is a step up the graphite ramp rather than a lighter grey: on this
        // canvas a mid-grey track reads as disabled.
        'data-[state=unchecked]:bg-surface-2 data-[state=unchecked]:border-border',
        'data-[state=checked]:bg-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-foreground shadow-sm',
          'transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5',
          // Graphite ink on the cyan track, matching the primary button's
          // ink-on-brand pairing rather than white-on-cyan, which is 1.3:1.
          'data-[state=checked]:bg-primary-foreground',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
