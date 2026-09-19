import { HeaderSkeleton, PanelSkeleton } from '@/components/studio/page-skeletons'

/**
 * Fallback loader for any studio route without a loader of its own, so a slow
 * segment shows the page's shape instead of an empty frame. The shell (sidebar
 * and topbar) stays put — only the main region swaps.
 */
export default function StudioLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton />
      <PanelSkeleton className="h-80" />
    </div>
  )
}
