import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Honest placeholder for a surface that is routed but not built yet.
 *
 * Every link in the sidebar resolves to a real page from Phase 1 onward — a
 * dead nav item reads as a broken product, so nothing is allowed to 404 while
 * it is waiting its turn.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon
  title: string
  description: string
  phase: string
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-20 text-center">
        <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>

        <h2 className="mt-4 text-sm font-medium">Landing in {phase}</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          This surface is routed and styled, and fills in when {phase} ships.
        </p>

        <Button asChild variant="outline" className="mt-6">
          <Link href="/dashboard">Back to the dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
