import Link from 'next/link'
import type { Metadata } from 'next'
import { Compass, MapPinOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

/** Catches any URL that matches no route, so a typo is never a bare 404. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-surface-2">
          <MapPinOff className="size-5 text-muted-foreground" aria-hidden />
        </div>

        <p className="eyebrow mt-6 text-brand">404</p>
        <h1 className="mt-3 font-display text-2xl font-semibold">
          There is no shot at this address
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you are looking for was moved, deleted, or never existed.
        </p>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/dashboard">Go to the dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/explore">
              <Compass className="size-4" />
              Browse Explore
            </Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
