import type { Metadata } from 'next'

import { ProjectsManager } from '@/components/projects/projects-manager'
import { listMyProjectSummaries } from '@/services/project.service'

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Everything you make, filed where you can find it.',
}

/**
 * The project grid.
 *
 * Server-rendered with counts and covers already resolved, so the first paint
 * is the real thing; the client half owns only the dialogs.
 */
export default async function ProjectsPage() {
  const projects = await listMyProjectSummaries()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <ProjectsManager projects={projects} />
    </div>
  )
}
