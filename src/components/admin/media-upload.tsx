'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Replace, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { replaceMediaFile, uploadMediaFile } from '@/app/admin/_actions/media'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MediaCategory } from '@/types/database'

/**
 * The two file-handling forms in the media library.
 *
 * These are the only forms in the admin panel that do not go through `RecordForm`, and
 * the reason is the file itself: a `File` cannot be serialised into a values object, so
 * the action has to receive `FormData`. Next.js sends a native form's `FormData` to a
 * Server Action directly, which is what makes this work without base64 in a JSON
 * payload.
 *
 * The client-side checks on type and size are a courtesy, not the enforcement.
 * `uploadMedia` re-checks both and the storage bucket enforces its own limits — this is
 * about not spending thirty seconds uploading a 40MB PNG to be told no.
 */

const CATEGORIES: { value: MediaCategory; label: string }[] = [
  { value: 'brand', label: 'Brand — logo, favicon, OG image' },
  { value: 'ui', label: 'UI — screenshots, diagrams' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'person', label: 'Person' },
  { value: 'animal', label: 'Animal' },
  { value: 'urban', label: 'Urban' },
  { value: 'abstract', label: 'Abstract' },
  { value: 'still_life', label: 'Still life' },
  { value: 'other', label: 'Other' },
]

const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/svg+xml,image/x-icon'
const MAX_BYTES = 10 * 1024 * 1024

/** Shared pre-flight, so both forms refuse the same things for the same reasons. */
function rejectFile(file: File | undefined | null): string | null {
  if (!file || file.size === 0) return 'Choose a file.'
  if (file.size > MAX_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`
  }
  if (!ACCEPT.split(',').includes(file.type)) {
    return 'Use a PNG, JPEG, WebP, AVIF, SVG or ICO file.'
  }
  return null
}

export function MediaUploadForm({ folders }: { folders: string[] }) {
  const [pending, startTransition] = React.useTransition()
  const [preview, setPreview] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)
  const router = useRouter()

  // The object URL is revoked on replacement and on unmount. A preview that leaks one
  // per file choice is the classic way an admin screen holds onto a hundred megabytes.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const problem = rejectFile(file)

    if (problem) {
      toast.error(problem)
      event.target.value = ''
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setFileName(null)
      return
    }

    setPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
    setFileName(file?.name ?? null)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const file = form.get('file')
    const problem = rejectFile(file instanceof File ? file : null)
    if (problem) {
      toast.error(problem)
      return
    }

    startTransition(async () => {
      const result = await uploadMediaFile(form)
      if (!result.ok) {
        toast.error(result.error ?? 'Could not upload that.')
        return
      }
      toast.success('Uploaded.')
      formRef.current?.reset()
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setFileName(null)
      router.refresh()
    })
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="media-file">File</Label>
          <Input
            id="media-file"
            name="file"
            type="file"
            accept={ACCEPT}
            required
            onChange={onFile}
            className="file:mr-3 file:cursor-pointer file:rounded-md file:bg-surface-2 file:px-3 file:py-1"
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, WebP, AVIF, SVG or ICO, up to 10MB. It lands in the public bucket and is
            served from a CDN URL.
          </p>
        </div>

        {preview && (
          <div className="sm:col-span-2">
            <div className="flex items-center gap-4 rounded-lg border border-border bg-surface/40 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt=""
                className="size-20 rounded-md border border-border object-cover"
              />
              <p className="min-w-0 truncate text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="media-title">Title</Label>
          <Input id="media-title" name="title" placeholder="Primary logo" />
          <p className="text-xs text-muted-foreground">
            What you will look for it by. Optional, but a library of untitled files is a library
            nobody searches.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="media-folder">Folder</Label>
          <Select name="folder" defaultValue="library">
            <SelectTrigger id="media-folder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {folders.map((folder) => (
                <SelectItem key={folder} value={folder}>
                  {folder}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="media-alt">Alt text</Label>
          <Textarea
            id="media-alt"
            name="alt"
            rows={2}
            required
            placeholder="A wet rooftop at dusk with neon signage behind a figure in a long coat"
          />
          <p className="text-xs text-muted-foreground">
            Required. Describe what is in the frame, not what it is for — this is what a screen
            reader says and what shows when the image fails to load.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="media-category">Category</Label>
          <Select name="category" defaultValue="other">
            <SelectTrigger id="media-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="media-tags">Tags</Label>
          <Input id="media-tags" name="tags" placeholder="cinematic, fog, wide" />
          <p className="text-xs text-muted-foreground">Comma separated.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="media-credit">Credit</Label>
          <Input id="media-credit" name="creditName" placeholder="Photographer’s name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="media-credit-url">Credit link</Label>
          <Input id="media-credit-url" name="creditUrl" type="url" placeholder="https://…" />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
        Upload
      </Button>
    </form>
  )
}

/**
 * Swaps the file behind an existing entry, keeping its id.
 *
 * The id is what every CMS row references, so replacing a logo must not mean
 * re-pointing every reference at a new row — which is what deleting and re-uploading
 * would force somebody to do, across bands, models and testimonials.
 */
export function MediaReplaceButton({ id, slug }: { id: string; slug: string }) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    form.set('id', id)

    const file = form.get('file')
    const problem = rejectFile(file instanceof File ? file : null)
    if (problem) {
      toast.error(problem)
      return
    }

    startTransition(async () => {
      const result = await replaceMediaFile(form)
      if (!result.ok) {
        toast.error(result.error ?? 'Could not replace that file.')
        return
      }
      toast.success('Replaced. Every page that used it now shows the new file.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
        <Replace className="size-4" aria-hidden />
        <span className="sr-only">Replace the file behind {slug}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace {slug}</DialogTitle>
            <DialogDescription className="mt-1.5">
              The entry keeps its id, so everything that references this image picks up the new file
              automatically. The old file is deleted once the swap succeeds.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label htmlFor={`replace-${id}`}>New file</Label>
              <Input
                id={`replace-${id}`}
                name="file"
                type="file"
                accept={ACCEPT}
                required
                className="file:mr-3 file:cursor-pointer file:rounded-md file:bg-surface-2 file:px-3 file:py-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Replace the file
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
