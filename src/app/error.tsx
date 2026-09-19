'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Route-level error boundary. Anything that throws while rendering a page
 * lands here instead of showing the user a raw 500.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] unhandled render error:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
          <TriangleAlert className="size-5 text-destructive" aria-hidden />
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          That is on us, not you. Trying again usually clears it.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-muted-foreground/70">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RotateCw className="size-4" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to the dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
