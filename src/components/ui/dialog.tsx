'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Modal dialog.
 *
 * Radix handles the focus trap, the scroll lock, Escape and the labelling
 * contract — DialogTitle is required, so `DialogHeader` always renders one and
 * the sr-only escape hatch is `className="sr-only"` on the title rather than
 * omitting it.
 *
 * The enter animations are plain classes defined in globals.css next to
 * `menu-pop`, keyed off Radix's own `data-state` there rather than through a
 * Tailwind variant — tailwindcss-animate is not a dependency, and a variant
 * cannot target a class Tailwind did not generate.
 */

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
        'overlay-fade',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // Pinned to the viewport with a max height so a long list scrolls
          // inside the panel instead of pushing the close button off screen.
          'fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,48rem)] w-[calc(100vw-2rem)] max-w-2xl',
          '-translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl',
          'border border-border bg-popover text-popover-foreground shadow-2xl',
          'dialog-pop',
          className,
        )}
        {...props}
      >
        {children}

        <DialogPrimitive.Close
          className={cn(
            'absolute right-3.5 top-3.5 rounded-lg p-1.5 text-muted-foreground transition-colors',
            'hover:bg-surface-2 hover:text-foreground',
          )}
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-14', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-medium tracking-tight', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5',
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
}
