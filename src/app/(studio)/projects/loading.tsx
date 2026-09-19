import { GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'

export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton action />
      <GridSkeleton count={6} />
    </div>
  )
}
