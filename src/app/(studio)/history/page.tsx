import type { Metadata } from 'next'

import type { DrawerProject } from '@/components/gallery/generation-drawer'
import { HistoryTable } from '@/components/gallery/history-table'
import { PageHeader } from '@/components/studio/page-header'
import { listMyGenerations } from '@/services/generation.service'
import { listMyProjects } from '@/services/project.service'

export const metadata: Metadata = {
  title: 'History',
  description: 'Every job you have run, including the ones that failed.',
}

const PAGE_SIZE = 30

/**
 * The job log.
 *
 * Unlike the library, nothing is filtered out by default: a failed job and its
 * refund are part of the record, and hiding them is how a user ends up unable
 * to explain their own balance.
 */
export default async function HistoryPage() {
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
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Content"
        title="History"
        description="Every job you have run, newest first — what it used, what it cost, and what came back."
      />

      <HistoryTable
        initialGenerations={generations}
        projects={drawerProjects}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
