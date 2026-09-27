import { ExternalLink } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  ResultCount,
} from '@/components/admin/admin-chrome'
import {
  DeleteButton,
  FilterChips,
  Pager,
  SearchFilter,
  ToggleAction,
} from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { MediaReplaceButton, MediaUploadForm } from '@/components/admin/media-upload'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  listMedia,
  listMediaFolders,
  MEDIA_FOLDERS,
  type MediaItem,
} from '@/services/cms/media.service'
import type { MediaCategory } from '@/types/database'

import { editMedia, linkMediaUrl, removeMedia, setMediaActive } from '../_actions/media'

/**
 * The media library.
 *
 * A grid rather than a table, because the thing an operator is looking for is an image
 * and a row of filenames is not how anybody finds one. Everything else about the screen
 * is in service of that: the search covers slug, title and alt text, the folder chips
 * narrow it, and each tile carries the four actions that apply to an image.
 *
 * Replace is the action worth explaining, and the tile's tooltip does. Every CMS row
 * references media by id, so replacing the file behind an entry updates the logo
 * everywhere at once — where deleting and re-uploading would leave an operator
 * re-pointing a dozen references by hand.
 */

const PAGE_SIZE = 24

const CATEGORY_CHIPS: { value: MediaCategory; label: string }[] = [
  { value: 'brand', label: 'Brand' },
  { value: 'ui', label: 'UI' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'person', label: 'Person' },
  { value: 'animal', label: 'Animal' },
  { value: 'urban', label: 'Urban' },
  { value: 'abstract', label: 'Abstract' },
  { value: 'still_life', label: 'Still life' },
  { value: 'other', label: 'Other' },
]

function editFields(folders: string[]): FieldSpec[] {
  return [
    { kind: 'text', name: 'title', label: 'Title', half: true },
    {
      kind: 'select',
      name: 'folder',
      label: 'Folder',
      options: folders.map((folder) => ({ value: folder, label: folder })),
      half: true,
    },
    {
      kind: 'textarea',
      name: 'alt',
      label: 'Alt text',
      required: true,
      rows: 2,
      help: 'What is in the frame. This is what a screen reader reads out.',
    },
    {
      kind: 'select',
      name: 'category',
      label: 'Category',
      options: CATEGORY_CHIPS,
      half: true,
    },
    { kind: 'tags', name: 'tags', label: 'Tags', help: 'Free-form. Used to find things later.' },
    { kind: 'text', name: 'credit_name', label: 'Credit', half: true },
    { kind: 'text', name: 'credit_url', label: 'Credit link', half: true },
    {
      kind: 'boolean',
      name: 'is_active',
      label: 'Available',
      help: 'An unavailable image stays in the library but cannot be picked, and disappears from any public surface reading it.',
    },
  ]
}

const LINK_FIELDS: FieldSpec[] = [
  {
    kind: 'text',
    name: 'url',
    label: 'Image URL',
    required: true,
    mono: true,
    help: 'Must be https. The file stays where it is — this table records a pointer to it.',
  },
  { kind: 'text', name: 'title', label: 'Title', half: true },
  { kind: 'text', name: 'slug', label: 'Slug', half: true, mono: true },
  { kind: 'textarea', name: 'alt', label: 'Alt text', required: true, rows: 2 },
  { kind: 'select', name: 'category', label: 'Category', options: CATEGORY_CHIPS, half: true },
  {
    kind: 'select',
    name: 'folder',
    label: 'Folder',
    options: MEDIA_FOLDERS.map((folder) => ({ value: folder, label: folder })),
    half: true,
  },
  { kind: 'text', name: 'credit_name', label: 'Credit', half: true },
  { kind: 'text', name: 'credit_url', label: 'Credit link', half: true },
  { kind: 'tags', name: 'tags', label: 'Tags' },
]

function initialFor(item: MediaItem) {
  return {
    title: item.title ?? '',
    folder: item.folder,
    alt: item.alt,
    category: item.category,
    tags: item.tags,
    credit_name: item.creditName ?? '',
    credit_url: item.creditUrl ?? '',
    is_active: item.isActive,
  }
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; folder?: string; page?: string }>
}) {
  const actor = await requireCapability('media:read', '/admin/media')
  const params = await searchParams

  const canWrite = can(actor.role, 'media:write')
  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [result, folders] = await Promise.all([
    listMedia({
      search: params.q,
      category: params.category as MediaCategory | undefined,
      folder: params.folder,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listMediaFolders(),
  ])

  const spec = editFields(folders)

  return (
    <>
      <AdminPageHeader
        eyebrow="Content"
        title="Media"
        description="Every image the CMS can use. Uploads land in the public bucket; a linked URL stays wherever it is hosted."
        actions={
          canWrite ? (
            <RecordDialog
              title="Link an image somebody else hosts"
              description="For reference photography and anything already on a CDN. Nothing is copied — this records a pointer."
              fields={LINK_FIELDS}
              initial={{ category: 'other', folder: 'library' }}
              action={linkMediaUrl}
              submitLabel="Add the link"
              successMessage="Image linked."
              resetOnSave
              columns={2}
              triggerLabel="Link a URL"
              triggerVariant="outline"
            />
          ) : undefined
        }
      />

      {canWrite && (
        <AdminPanel
          title="Upload"
          description="The file goes into the public bucket and is served from a CDN URL. Alt text is required."
        >
          <MediaUploadForm folders={folders} />
        </AdminPanel>
      )}

      <AdminPanel
        title="Library"
        actions={<SearchFilter placeholder="Search title, slug or alt text" className="w-64" />}
      >
        <div className="space-y-3">
          <FilterChips paramName="category" options={CATEGORY_CHIPS} allLabel="All categories" />
          <FilterChips
            paramName="folder"
            options={folders.map((folder) => ({ value: folder, label: folder }))}
            allLabel="All folders"
          />
        </div>

        {result.items.length === 0 ? (
          <AdminEmpty
            title="Nothing matches."
            description={
              params.q || params.category || params.folder
                ? 'Clear the filters, or upload something.'
                : 'Upload an image or link one to get started.'
            }
            action={undefined}
          />
        ) : (
          <>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((item) => (
                <li key={item.id} className="group overflow-hidden rounded-xl border border-border bg-surface/40">
                  <div className="relative aspect-video overflow-hidden bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.alt}
                      loading="lazy"
                      className="size-full object-cover"
                    />

                    {!item.isActive && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Badge variant="secondary" onMedia>
                          Unavailable
                        </Badge>
                      </span>
                    )}

                    <span className="absolute left-2 top-2 flex gap-1">
                      <Badge variant="outline" onMedia className="text-[10px]">
                        {item.folder}
                      </Badge>
                      {item.source === 'external' && (
                        <Badge variant="secondary" onMedia className="text-[10px]">
                          linked
                        </Badge>
                      )}
                    </span>
                  </div>

                  <div className="space-y-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title ?? item.slug}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.alt}
                      </p>
                    </div>

                    <p className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                      <span>{item.category}</span>
                      <span aria-hidden>·</span>
                      <span>{humanSize(item.sizeBytes)}</span>
                      {item.mimeType && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{item.mimeType.replace('image/', '')}</span>
                        </>
                      )}
                    </p>

                    {item.tags.length > 0 && (
                      <ul className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 4).map((tag) => (
                          <li key={tag}>
                            <Badge variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex items-center justify-between gap-1 border-t border-border/60 pt-2">
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="icon-sm">
                          <a href={item.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" aria-hidden />
                            <span className="sr-only">Open {item.slug} full size</span>
                          </a>
                        </Button>

                        {canWrite && item.source === 'upload' && (
                          <MediaReplaceButton id={item.id} slug={item.title ?? item.slug} />
                        )}

                        {canWrite && (
                          <RecordDialog
                            title={`Edit ${item.title ?? item.slug}`}
                            fields={spec}
                            initial={initialFor(item)}
                            action={editMedia.bind(null, item.id)}
                            columns={2}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                        )}
                      </div>

                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <ToggleAction
                            checked={item.isActive}
                            action={setMediaActive.bind(null, item.id)}
                            label={`Make ${item.slug} available`}
                          />
                          <DeleteButton
                            action={removeMedia.bind(null, item.id)}
                            what="this image"
                            description={
                              item.source === 'upload' ? (
                                <>
                                  The file is deleted from storage as well as from the library.
                                  Anything referencing it falls back to whatever it renders without
                                  an image.
                                </>
                              ) : (
                                <>
                                  The entry is removed. The file itself is hosted elsewhere and is
                                  untouched.
                                </>
                              )
                            }
                            iconOnly
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <ResultCount shown={result.items.length} total={result.total} noun="images" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>
    </>
  )
}
