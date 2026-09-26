'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * "Are you sure?" for an action that cannot be taken back.
 *
 * Promoted out of the billing manager, which had grown the only copy of this
 * and then needed a second one for deletes. One component means the cancel
 * button is always first in the tab order and always the thing Radix autofocuses
 * — so Enter on an unread dialog backs out rather than confirming, which is the
 * single most important property a destructive confirm has.
 *
 * `children` is for the specific, checkable detail: which file, how many of
 * them, what exactly is lost. The description says what the action means; the
 * children say what it will do to *this* item, and a confirm without that is a
 * dialog people learn to click through.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending = false,
  tone = 'destructive',
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  pending?: boolean
  /** `destructive` paints the confirm red. `default` is for merely irreversible. */
  tone?: 'destructive' | 'default'
  onConfirm: () => void
  children?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                tone === 'destructive' ? 'bg-destructive/15' : 'bg-warning/15',
              )}
              aria-hidden
            >
              <AlertTriangle
                className={cn('size-4', tone === 'destructive' ? 'text-danger' : 'text-warning')}
              />
            </span>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1.5 leading-relaxed">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {children && <div className="px-5 py-4">{children}</div>}

        <DialogFooter>
          {/*
            Cancel first in the DOM, so it is what Radix focuses on open and
            what Enter activates. The confirm is reachable in one Tab; that
            asymmetry is deliberate.
          */}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
