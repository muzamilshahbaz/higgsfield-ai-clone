import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { PageHeader } from '@/components/studio/page-header'
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
      <PageHeader eyebrow="Workspace" title={title} description={description} className="mb-8" />

      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border px-6 py-20 text-center">
        <div className="blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>

        <h2 className="relative mt-4 font-display text-[15px] font-medium">Landing in {phase}</h2>
        <p className="relative mt-1.5 max-w-sm text-sm text-muted-foreground">
          This surface is routed and styled, and fills in when {phase} ships.
        </p>

        <Button asChild variant="outline" className="relative mt-6">
          <Link href="/dashboard">Back to the dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
