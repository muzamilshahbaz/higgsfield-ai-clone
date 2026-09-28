import { BadgeCheck, Star } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec, MediaOption } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cmsList } from '@/services/cms/crud'
import { listMedia } from '@/services/cms/media.service'
import type { TestimonialRow } from '@/types/cms'

import {
  createTestimonial,
  deleteTestimonial,
  setTestimonialVisible,
  updateTestimonial,
} from '../_actions/content'

/**
 * Testimonials.
 *
 * Seeded empty on purpose, and the panel says why. The landing page has a standing rule
 * against invented social proof — the numbers on it are counted and the model list is
 * read from the registry — and a CMS that shipped three plausible quotes would have
 * broken that rule on everybody's behalf.
 *
 * `is_verified` is the field that matters. It records that a real person said this and
 * that somebody checked; the band renders a tick beside a verified quote and nothing
 * beside an unverified one, so the distinction is visible to a reader rather than only
 * to the operator.
 */

function fields(media: MediaOption[]): FieldSpec[] {
  return [
    { kind: 'text', name: 'author_name', label: 'Name', required: true, half: true, maxLength: 120 },
    { kind: 'text', name: 'author_role', label: 'Role', half: true, placeholder: 'Director' },
    { kind: 'text', name: 'author_company', label: 'Company', half: true },
    {
      kind: 'text',
      name: 'author_url',
      label: 'Link',
      half: true,
      help: 'Their site or profile. Optional, and rendered as the attribution link.',
    },
    {
      kind: 'textarea',
      name: 'quote',
      label: 'Quote',
      required: true,
      rows: 4,
      maxLength: 1200,
      help: 'Their words, unedited. Trim with an ellipsis rather than rewriting.',
    },
    {
      kind: 'number',
      name: 'rating',
      label: 'Rating',
      half: true,
      min: 0,
      max: 5,
      help: '1 to 5, or 0 for no rating.',
    },
    ...(media.length > 0
      ? ([{ kind: 'media', name: 'avatar_media_id', label: 'Avatar' }] as FieldSpec[])
      : []),
    {
      kind: 'boolean',
      name: 'is_verified',
      label: 'Verified',
      help: 'Tick this only when you have confirmed the person said it. The band renders a tick for a verified quote.',
    },
    {
      kind: 'boolean',
      name: 'is_featured',
      label: 'Featured',
      help: 'Featured quotes are shown first.',
    },
    { kind: 'boolean', name: 'is_visible', label: 'Published' },
  ]
}

function initialFor(row: TestimonialRow) {
  return {
    author_name: row.author_name,
    author_role: row.author_role ?? '',
    author_company: row.author_company ?? '',
    author_url: row.author_url ?? '',
    quote: row.quote,
    rating: row.rating ?? 0,
    avatar_media_id: row.avatar_media_id ?? '',
    is_verified: row.is_verified,
    is_featured: row.is_featured,
    is_visible: row.is_visible,
  }
}

export default async function AdminTestimonialsPage() {
  const actor = await requireCapability('content:read', '/admin/testimonials')
  const canWrite = can(actor.role, 'content:write')

  const [rows, mediaResult] = await Promise.all([
    cmsList('testimonials', { orderBy: 'sort_order' }),
    listMedia({ includeInactive: false, limit: 60 }),
  ])

  const media: MediaOption[] = mediaResult.items.map((item) => ({
    id: item.id,
    label: item.title ?? item.slug,
    url: item.url,
    folder: item.folder,
  }))

  const spec = fields(media)
  const published = rows.filter((row) => row.is_visible).length

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="Content"
        title="Testimonials"
        description="Quotes from people using the product. The band renders only when at least one is published, so an empty table means no section."
        actions={
          <RecordDialog
            title="New testimonial"
            description="Their words, their attribution. Tick Verified only once you have confirmed they said it."
            fields={spec}
            initial={{ is_visible: true, is_verified: false, rating: 0 }}
            action={createTestimonial}
            submitLabel="Add the testimonial"
            successMessage="Testimonial added."
            resetOnSave
            mediaOptions={media}
            columns={2}
            triggerLabel="New testimonial"
          />
        }
      />

      {rows.length === 0 && (
        <AdminPanel title="Why this table starts empty">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The landing page does not invent social proof. Every figure on it is counted from the
            catalogue or the database, the model list is read from the registry, and there are no
            customer logos — because none of them would be real.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            So this table ships empty rather than seeded with plausible quotes, and the band renders
            only once there is something genuine in it. Add a real one and the section appears.
          </p>
        </AdminPanel>
      )}

      <AdminPanel
        title={`${rows.length} testimonial${rows.length === 1 ? '' : 's'}`}
        description={`${published} published.`}
      >
        {rows.length === 0 ? (
          <AdminEmpty
            title="Nothing here yet."
            description="The testimonials band is not rendered while this table is empty."
          />
        ) : (
          <AdminTable
            head={
              <>
                <Th>Quote</Th>
                <Th className="w-48">Attribution</Th>
                <Th className="w-28">Flags</Th>
                <Th className="w-24">Published</Th>
                <Th className="w-36" />
              </>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <Td className="max-w-[26rem]">
                  <p className="line-clamp-3 text-sm leading-relaxed">“{row.quote}”</p>
                </Td>

                <Td>
                  <p className="font-medium">{row.author_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[row.author_role, row.author_company].filter(Boolean).join(' · ') || '—'}
                  </p>
                </Td>

                <Td>
                  <div className="flex flex-wrap gap-1">
                    {row.is_verified && (
                      <Badge variant="success" className="gap-1">
                        <BadgeCheck className="size-3" aria-hidden />
                        Verified
                      </Badge>
                    )}
                    {row.is_featured && <Badge variant="default">Featured</Badge>}
                    {row.rating && (
                      <Badge variant="secondary" className="gap-1 tabular-nums">
                        <Star className="size-3" aria-hidden />
                        {row.rating}
                      </Badge>
                    )}
                  </div>
                </Td>

                <Td>
                  <ToggleAction
                    checked={row.is_visible}
                    action={setTestimonialVisible.bind(null, row.id)}
                    label={`Publish the testimonial from ${row.author_name}`}
                  />
                </Td>

                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <RecordDialog
                      title={`Edit ${row.author_name}’s testimonial`}
                      fields={spec}
                      initial={initialFor(row)}
                      action={updateTestimonial.bind(null, row.id)}
                      mediaOptions={media}
                      columns={2}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      }
                    />
                    <DeleteButton
                      action={deleteTestimonial.bind(null, row.id)}
                      what="this testimonial"
                      description={<>The quote from {row.author_name} will be removed.</>}
                      iconOnly
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>
    </AdminWriteScope>
  )
}
