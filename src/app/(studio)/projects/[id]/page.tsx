import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Sparkles } from 'lucide-react'

import { LibraryGrid } from '@/components/gallery/library-grid'
import type { DrawerProject } from '@/components/gallery/generation-drawer'
import { Button } from '@/components/ui/button'
import { listMyGenerations } from '@/services/generation.service'
import { getProject, listMyProjects } from '@/services/project.service'

const PAGE_SIZE = 24

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const project = await getProject(id)

  if (!project) return { title: 'Project not found' }
  return {
    title: project.title,
    description: project.description ?? 'Everything filed under this project.',
  }
}

/**
 * One project's work.
 *
 * The body is the same `LibraryGrid` the library uses, scoped to this project —
 * so filtering, paging, the detail drawer, delete and move all behave
 * identically wherever the user meets them.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [project, generations, projects] = await Promise.all([
    getProject(id),
    listMyGenerations({ projectId: id, limit: PAGE_SIZE }),
    listMyProjects(),
  ])

  // RLS turns "someone else's project" into null, so this covers both a bad id
  // and a project that is not the caller's.
  if (!project) notFound()

  const drawerProjects: DrawerProject[] = projects.map((row) => ({
    id: row.id,
    title: row.title,
    isDefault: row.is_default,
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/projects">
            <ArrowLeft className="size-4" />
            All projects
          </Link>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {project.description ??
                'Everything filed here. Open a shot to download it, move it or set it as the cover.'}
            </p>
          </div>

          <Button asChild>
            <Link href={`/create?project=${project.id}`}>
              <Sparkles className="size-4" />
              Add to this project
            </Link>
          </Button>
        </div>
      </div>

      <LibraryGrid
        initialGenerations={generations}
        projects={drawerProjects}
        projectId={project.id}
        pageSize={PAGE_SIZE}
        emptyTitle="Nothing in this project yet"
        emptyDescription="Generate something with this project selected, or move an existing shot here from the library."
      />
    </div>
  )
}
