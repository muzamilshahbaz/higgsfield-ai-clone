'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

import { SidebarNav } from '@/components/studio/sidebar-nav'
import { Button } from '@/components/ui/button'

/**
 * The sidebar, as a slide-over, below `lg`.
 *
 * It renders through a portal onto `document.body`, and that is not a
 * preference. The topbar this button lives in has `backdrop-blur`, and any
 * non-`none` filter, backdrop-filter or transform makes an element the
 * containing block for `position: fixed` descendants — so `fixed inset-0`
 * resolved to the 57px header and the menu opened as a sliver with every link
 * clipped out of view. The portal puts the overlay outside that ancestor,
 * where `inset-0` means the viewport again.
 *
 * It is a modal: it closes on Escape, on backdrop click and on navigation,
 * locks body scroll, keeps Tab inside itself, and hands focus back to the
 * button that opened it.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Portals need a DOM to portal into, which the server render does not have.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Close whenever the route changes, so a tap always lands on the new page.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    // Captured now rather than read in the cleanup: by then the ref may point
    // somewhere else, and what we want is the button that opened *this* menu.
    const trigger = triggerRef.current
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }

      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) return

      const first = items[0]!
      const last = items[items.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    focusables()[0]?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      // Back to the button that opened it, not to the top of the document.
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-background p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">Menu</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close navigation"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
