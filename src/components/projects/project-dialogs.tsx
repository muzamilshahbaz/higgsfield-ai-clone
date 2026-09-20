'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'

import { createProjectAction, updateProjectAction, deleteProjectAction } from '@/app/(studio)/projects/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_TITLE_MAX,
  createProjectSchema,
} from '@/lib/validation/project'
import type { Project } from '@/services/project.service'

/**
 * Create and rename.
 *
 * One dialog for both, because they are the same two fields and the same
 * validation — only the verb changes. Validation runs here against the schema
 * the Server Action also runs, so a title the form accepts is one the server
 * accepts.
 */
export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present for a rename, absent to create. */
  project?: Project | null
  onSaved?: (project: Project) => void
}) {
  const router = useRouter()
  const editing = Boolean(project)

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Reopening for a different project must not show the last one's values.
  React.useEffect(() => {
    if (!open) return
    setTitle(project?.title ?? '')
    setDescription(project?.description ?? '')
    setError(null)
  }, [open, project])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    const parsed = createProjectSchema.safeParse({ title, description })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.')
      return
    }

    setError(null)
    setSaving(true)

    const result = project
      ? await updateProjectAction({ id: project.id, ...parsed.data })
      : await createProjectAction(parsed.data)

    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onSaved?.(result.data)
    onOpenChange(false)
    toast.success(editing ? 'Project updated' : `${result.data.title} created`)
    // The grid is server-rendered, so the new row only appears on a refresh.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Rename project' : 'New project'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Projects are how the library stays navigable once there is a lot in it.'
                : 'Give the work a home. You can move generations between projects at any time.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="project-title">Name</Label>
              <Input
                id="project-title"
                value={title}
                autoFocus
                maxLength={PROJECT_TITLE_MAX}
                placeholder="Product launch film"
                aria-invalid={Boolean(error)}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-description">Description (optional)</Label>
              <Textarea
                id="project-description"
                rows={3}
                value={description}
                maxLength={PROJECT_DESCRIPTION_MAX}
                placeholder="What this project is for."
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? 'Save' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Delete.
 *
 * The dialog states exactly what happens to the work inside, because the
 * answer is not the obvious one: the generations are moved to the default
 * project rather than deleted with their container.
 */
export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  generationCount,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
  generationCount: number
  onDeleted?: (id: string) => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function remove() {
    if (!project || deleting) return

    setDeleting(true)
    const result = await deleteProjectAction(project.id)
    setDeleting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDeleted?.(project.id)
    onOpenChange(false)
    toast.success(`${result.data.title} deleted`, {
      description:
        result.data.moved > 0
          ? `${result.data.moved} ${result.data.moved === 1 ? 'shot' : 'shots'} moved to your default project.`
          : undefined,
    })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {project?.title}?</DialogTitle>
          <DialogDescription>
            {generationCount > 0
              ? `The ${generationCount} ${generationCount === 1 ? 'shot' : 'shots'} filed here will move to your default project — nothing is deleted with it.`
              : 'This project is empty, so nothing else changes.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="px-5 pt-4 text-xs text-danger">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={deleting}>
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
