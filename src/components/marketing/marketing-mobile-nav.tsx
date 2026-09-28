'use client'

import * as React from 'react'
import Link from 'next/link'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowRight, Menu, X } from 'lucide-react'

import { KineticLogo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { DEFAULT_NAV, resolveNavHref, type NavLinkItem } from '@/lib/cms/content'

/**
 * The landing page's mobile menu.
 *
 * A Radix dialog rather than a hand-rolled panel, for the three things a
 * hand-rolled one always gets wrong: focus is trapped while it is open, Escape
 * closes it, and the page behind it is marked inert so a swipe cannot scroll
 * it. The trigger is a real button with an accessible name.
 *
 * Every link closes the sheet on click. Most are in-page anchors, so without
 * that the menu would stay open over the section it just scrolled to — the
 * single most common bug in a mobile marketing nav.
 *
 * The links arrive as a prop rather than being imported, because they are now database rows
 * the header has already read. `DEFAULT_NAV.header` is the fallback for a caller that has
 * nothing — the same links this file used to import.
 */
export function MarketingMobileNav({
  isSignedIn = false,
  isStaff = false,
  onLandingPage = false,
  links = DEFAULT_NAV.header,
}: {
  isSignedIn?: boolean
  /** Staff get the panel here too, so the two bars never disagree. */
  isStaff?: boolean
  /** Anchors only work on the landing page; elsewhere they need the `/` prefix. */
  onLandingPage?: boolean
  links?: NavLinkItem[]
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="size-5" aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="overlay-fade fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />

        <DialogPrimitive.Content className="dialog-pop fixed inset-x-0 top-0 z-50 border-b border-border bg-background p-4 shadow-lift sm:p-6">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>

          <div className="flex items-center justify-between">
            <Link href="/" onClick={() => setOpen(false)}>
              <KineticLogo />
            </Link>

            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <nav className="mt-6 flex flex-col" aria-label="Sections">
            {links.map((item, index) => (
              <Link
                key={item.id}
                href={resolveNavHref(item, onLandingPage)}
                target={item.isExternal ? '_blank' : undefined}
                rel={item.isExternal ? 'noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-border/60 py-4 text-base font-medium transition-colors hover:text-brand"
              >
                {item.label}
                <span className="eyebrow text-muted-foreground" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-6 flex flex-col gap-2.5">
            {isSignedIn ? (
              <Button asChild size="lg">
                <Link href={isStaff ? '/admin' : '/dashboard'} onClick={() => setOpen(false)}>
                  {isStaff ? 'Admin panel' : 'Dashboard'}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/sign-up" onClick={() => setOpen(false)}>
                    Start creating free
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/sign-in" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                </Button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
