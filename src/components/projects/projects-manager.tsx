'use client'

import * as React from 'react'
import Link from 'next/link'
import { FolderPlus, Sparkles } from 'lucide-react'

import { ProjectCard } from '@/components/projects/project-card'
import { DeleteProjectDialog, ProjectFormDialog } from '@/components/projects/project-dialogs'
import { EmptyState } from '@/components/studio/empty-state'
import { Button } from '@/components/ui/button'
import type { ProjectSummary } from '@/services/project.service'

/**
 * The projects grid and the dialogs it opens.
 *
 * The rows are server-rendered and passed in; this component owns only which
 * dialog is open and for which project. After a write the Server Action
 * revalidates and `router.refresh()` brings the real rows back, so nothing
 * here keeps a second copy of the list that could drift.
 */
export function ProjectsManager({ projects }: { projects: ProjectSummary[] }) {
  const [creating, setCreating] = React.useState(false)
  const [renaming, setRenaming] = React.useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = React.useState<ProjectSummary | null>(null)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Everything you make is filed into a project. Your default one catches anything you
            do not file yourself.
          </p>
        </div>

        <Button onClick={() => setCreating(true)}>
          <FolderPlus className="size-4" />
          New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="A default project is created the first time you generate something — or start one now and name it yourself."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setCreating(true)}>
                <FolderPlus className="size-4" />
                New project
              </Button>
              <Button asChild variant="outline">
                <Link href="/create">
                  <Sparkles className="size-4" />
                  Open the composer
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onRename={setRenaming}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog open={creating} onOpenChange={setCreating} />

      <ProjectFormDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        project={renaming}
      />

      <DeleteProjectDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        project={deleting}
        generationCount={deleting?.generationCount ?? 0}
      />
    </>
  )
}
