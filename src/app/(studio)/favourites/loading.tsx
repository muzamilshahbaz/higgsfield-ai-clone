import { GridSkeleton, HeaderSkeleton } from '@/components/studio/page-skeletons'

export default function FavouritesLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton title="Favourites" />
      <GridSkeleton count={6} />
    </div>
  )
}
