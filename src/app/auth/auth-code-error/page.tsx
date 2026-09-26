import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Sign-in link problem',
  robots: { index: false, follow: false },
}

/**
 * Where /auth/callback sends anyone whose link could not be exchanged.
 * Exists so an expired or reused link is a readable page rather than a 500.
 */
export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
          <TriangleAlert className="size-5 text-danger" />
        </div>

        <h1 className="mt-6 font-display text-2xl font-semibold">That link did not work</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          {reason ?? 'We could not complete your sign-in.'}
        </p>

        <p className="mt-2 text-sm text-muted-foreground">
          Sign-in links can only be used once, and they expire. Request a fresh one and it should
          go through.
        </p>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/forgot-password">Send a new reset link</Link>
          </Button>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to the home page
        </Link>
      </div>
    </main>
  )
}
