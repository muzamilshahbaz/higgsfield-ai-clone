import type { Metadata } from 'next'

import type { DrawerProject } from '@/components/gallery/generation-drawer'
import { LibraryGrid } from '@/components/gallery/library-grid'
import { PageHeader } from '@/components/studio/page-header'
import { listMyGenerations } from '@/services/generation.service'
import { listMyProjects } from '@/services/project.service'

export const metadata: Metadata = {
  title: 'Library',
  description: 'Every asset you own, in one grid.',
}

const PAGE_SIZE = 24

/**
 * Everything the user has made.
 *
 * The first page is server-rendered so the grid is never empty for a frame;
 * filters and paging after that go through `/api/generations`.
 */
export default async function LibraryPage() {
  const [generations, projects] = await Promise.all([
    listMyGenerations({ limit: PAGE_SIZE }),
    listMyProjects(),
  ])

  const drawerProjects: DrawerProject[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
    isDefault: project.is_default,
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Library"
        description="Every shot you own. Open one to see how it was made, download it, reuse it as a start frame or move it to another project."
      />

      <LibraryGrid
        initialGenerations={generations}
        projects={drawerProjects}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
