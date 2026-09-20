import { GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'

export default function ProjectLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton action title="Project" />
      <GridSkeleton count={9} />
    </div>
  )
}
