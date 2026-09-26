'use client'

import * as React from 'react'
import Link from 'next/link'
import { FolderPlus, Search, Sparkles } from 'lucide-react'

import { Segmented, type SegmentedOption } from '@/components/composer/segmented'
import { ProjectCard } from '@/components/projects/project-card'
import { DeleteProjectDialog, ProjectFormDialog } from '@/components/projects/project-dialogs'
import { EmptyState } from '@/components/studio/empty-state'
import { PageHeader } from '@/components/studio/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ProjectSummary } from '@/services/project.service'

/**
 * The projects grid and the dialogs it opens.
 *
 * The rows are server-rendered and passed in; this component owns only which
 * dialog is open and for which project. After a write the Server Action
 * revalidates and `router.refresh()` brings the real rows back, so nothing here
 * keeps a second copy of the list that could drift.
 *
 * Search and sort are client-side, unlike the library's. That is a deliberate
 * difference rather than an inconsistency: a user has a handful of projects and
 * the whole list is already on the page, so a round trip per keystroke would
 * buy nothing. The library filters server-side because its list is paged and a
 * filter has to reach past what is loaded.
 */

type SortKey = 'recent' | 'name' | 'largest'

const SORT_OPTIONS: SegmentedOption<SortKey>[] = [
  { value: 'recent', label: 'Recent', hint: 'Most recently worked on' },
  { value: 'name', label: 'Name', hint: 'A to Z' },
  { value: 'largest', label: 'Largest', hint: 'Most shots first' },
]

/** Newest activity first, falling back to when the project was created. */
function activityOf(project: ProjectSummary): string {
  return project.lastActivityAt ?? project.created_at
}

export function ProjectsManager({ projects }: { projects: ProjectSummary[] }) {
  const [creating, setCreating] = React.useState(false)
  const [renaming, setRenaming] = React.useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = React.useState<ProjectSummary | null>(null)

  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('recent')
  const searchId = React.useId()

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase()

    const matched = needle
      ? projects.filter(
          (project) =>
            project.title.toLowerCase().includes(needle) ||
            (project.description ?? '').toLowerCase().includes(needle),
        )
      : projects

    // Copied before sorting: `projects` is a prop, and sorting it in place
    // mutates the array React handed us.
    return [...matched].sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title)
      if (sort === 'largest') return b.generationCount - a.generationCount
      return activityOf(b).localeCompare(activityOf(a))
    })
  }, [projects, search, sort])

  const searching = search.trim().length > 0

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Projects"
        description="Everything you make is filed into a project. Your default one catches anything you do not file yourself."
        action={
          <Button onClick={() => setCreating(true)}>
            <FolderPlus className="size-4" />
            New project
          </Button>
        }
      />

      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor={searchId} className="sr-only">
              Search your projects
            </label>
            <Input
              id={searchId}
              type="search"
              value={search}
              placeholder="Search projects"
              className="h-9 pl-8 text-sm"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Segmented name="Sort projects" size="sm" value={sort} options={SORT_OPTIONS} onChange={setSort} />

          <p role="status" className="ml-auto text-xs tabular-nums text-muted-foreground">
            {visible.length} of {projects.length}{' '}
            {projects.length === 1 ? 'project' : 'projects'}
          </p>
        </div>
      )}

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
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No projects match that search"
          description={`Nothing is called “${search.trim()}”. Try a shorter word, or clear the search.`}
          action={
            <Button variant="outline" onClick={() => setSearch('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} onRename={setRenaming} onDelete={setDeleting} />
            </li>
          ))}
        </ul>
      )}

      {searching && visible.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing projects matching “{search.trim()}”.{' '}
          <button
            type="button"
            onClick={() => setSearch('')}
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            Clear
          </button>
        </p>
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
