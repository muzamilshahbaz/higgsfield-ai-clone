import Link from 'next/link'
import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec, MediaOption } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { FEATURE_SPANS, resolveIcon } from '@/lib/admin/icons'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TASK_LABELS } from '@/lib/constants'
import { cmsList } from '@/services/cms/crud'
import { listMedia } from '@/services/cms/media.service'
import type { FeaturePlacement, SiteFeatureRow } from '@/types/cms'
import type { GenerationTask } from '@/types/database'

import {
  createFeature,
  deleteFeature,
  reorderFeatures,
  setFeatureVisible,
  updateFeature,
} from '../_actions/content'

/**
 * Feature cards, across all three placements.
 *
 * One screen rather than three, because they are the same shape and an editor moving a
 * card between bands should be changing a dropdown rather than re-typing it into
 * another form. The placements differ in which fields matter, which the help text says
 * per field rather than by hiding them:
 *
 *   features     — the bento grid. `span` decides the width; nothing else does.
 *   overview     — the three-point column. Title and body only.
 *   capabilities — the three cards that count models. `href` carries the generation
 *                  task, which is the join to the registry, and `detail` is the line
 *                  under the body.
 */

const PLACEMENTS: { value: FeaturePlacement; label: string; hint: string }[] = [
  { value: 'features', label: 'Feature grid (band 06)', hint: 'The bento. Uses the width field.' },
  { value: 'overview', label: 'Overview points (band 01)', hint: 'Title and body only.' },
  {
    value: 'capabilities',
    label: 'Capability cards (band 02)',
    hint: 'Counts models for the task in the link field.',
  },
  { value: 'footer_note', label: 'Footer notes', hint: 'Short lines in the footer column.' },
]

const TASK_OPTIONS: { value: GenerationTask; label: string }[] = (
  ['text_to_image', 'image_to_video', 'text_to_video'] as GenerationTask[]
).map((task) => ({ value: task, label: TASK_LABELS[task] }))

function fields(media: MediaOption[]): FieldSpec[] {
  return [
    {
      kind: 'select',
      name: 'placement',
      label: 'Where it appears',
      options: PLACEMENTS.map((entry) => ({ value: entry.value, label: entry.label })),
      half: true,
      help: 'Moving a card between bands is this field, not a new card.',
    },
    {
      kind: 'select',
      name: 'span',
      label: 'Width (feature grid only)',
      options: FEATURE_SPANS.map((span) => ({ value: span.value, label: span.label })),
      allowEmpty: true,
      emptyLabel: '— default —',
      half: true,
      help: 'The grid is six columns. Only these widths add up to a whole row.',
    },
    { kind: 'text', name: 'title', label: 'Title', required: true, maxLength: 120 },
    {
      kind: 'textarea',
      name: 'body',
      label: 'Body',
      rows: 3,
      help: 'Two sentences at most. The grid is dense and a long card pushes its neighbours out of line.',
    },
    {
      kind: 'textarea',
      name: 'detail',
      label: 'Detail line (capability cards)',
      rows: 2,
      help: 'Rendered against a coral rule under the body. Empty on the other placements.',
    },
    {
      kind: 'select',
      name: 'href',
      label: 'Generation task (capability cards)',
      options: TASK_OPTIONS,
      allowEmpty: true,
      emptyLabel: '— not a capability card —',
      half: true,
      help: 'How the card knows which models to count and what the cheapest one costs.',
    },
    { kind: 'icon', name: 'icon', label: 'Icon', help: 'Shown on capability cards.' },
    ...(media.length > 0
      ? ([{ kind: 'media', name: 'media_id', label: 'Image', help: 'Optional. Unused by the current bands, kept for a future card layout.' }] as FieldSpec[])
      : []),
    { kind: 'boolean', name: 'is_visible', label: 'Visible' },
  ]
}

function initialFor(row: SiteFeatureRow) {
  return {
    placement: row.placement,
    span: row.span ?? '',
    title: row.title,
    body: row.body,
    detail: row.detail ?? '',
    href: row.href ?? '',
    icon: row.icon ?? '',
    media_id: row.media_id ?? '',
    is_visible: row.is_visible,
  }
}

export default async function AdminFeaturesPage() {
  const actor = await requireCapability('content:read', '/admin/features')
  const canWrite = can(actor.role, 'content:write')

  const [rows, mediaResult] = await Promise.all([
    cmsList('site_features', { orderBy: 'placement', thenBy: 'sort_order' }),
    listMedia({ includeInactive: false, limit: 60 }),
  ])

  const media: MediaOption[] = mediaResult.items.map((item) => ({
    id: item.id,
    label: item.title ?? item.slug,
    url: item.url,
    folder: item.folder,
  }))

  const spec = fields(media)

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="Content"
        title="Features"
        description="The cards in the bento grid, the points beside the surface map, and the three capability cards that count the model registry."
        actions={
          <RecordDialog
            title="New card"
            description="Pick where it goes first — the fields that matter differ by placement."
            fields={spec}
            initial={{ placement: 'features', is_visible: true }}
            action={createFeature}
            submitLabel="Add the card"
            successMessage="Card added."
            resetOnSave
            mediaOptions={media}
            columns={2}
            triggerLabel="New card"
          />
        }
      />

      {PLACEMENTS.map((placement) => {
        const group = rows.filter((row) => row.placement === placement.value)
        const ids = group.map((row) => row.id)

        return (
          <AdminPanel
            key={placement.value}
            title={placement.label}
            description={placement.hint}
          >
            {group.length === 0 ? (
              <AdminEmpty
                title="No cards here."
                description={
                  placement.value === 'footer_note'
                    ? 'The footer notes are managed as navigation links instead — see Landing page.'
                    : 'The landing page is rendering the built-in set for this band. Add one to take over.'
                }
              />
            ) : (
              <AdminTable
                head={
                  <>
                    <Th className="w-20">Order</Th>
                    <Th>Card</Th>
                    <Th className="w-32">Extras</Th>
                    <Th className="w-24">Visible</Th>
                    <Th className="w-36" />
                  </>
                }
              >
                {group.map((row) => {
                  const Icon = row.icon ? resolveIcon(row.icon) : null
                  return (
                    <tr key={row.id}>
                      <Td>
                        <ReorderButtons
                          ids={ids}
                          id={row.id}
                          action={reorderFeatures}
                          label={row.title}
                        />
                      </Td>

                      <Td className="max-w-[26rem]">
                        <p className="flex items-center gap-2 font-medium">
                          {Icon && <Icon className="size-4 shrink-0 text-brand" aria-hidden />}
                          {row.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {row.body}
                        </p>
                      </Td>

                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {row.span && (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {FEATURE_SPANS.find((span) => span.value === row.span)?.label ??
                                row.span}
                            </Badge>
                          )}
                          {row.href && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {row.href}
                            </Badge>
                          )}
                        </div>
                      </Td>

                      <Td>
                        <ToggleAction
                          checked={row.is_visible}
                          action={setFeatureVisible.bind(null, row.id)}
                          label={`Show the “${row.title}” card`}
                        />
                      </Td>

                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <RecordDialog
                            title={`Edit “${row.title}”`}
                            fields={spec}
                            initial={initialFor(row)}
                            action={updateFeature.bind(null, row.id)}
                            mediaOptions={media}
                            columns={2}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteButton
                            action={deleteFeature.bind(null, row.id)}
                            what="this card"
                            description={<>“{row.title}” will be removed from the landing page.</>}
                            iconOnly
                          />
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </AdminTable>
            )}
          </AdminPanel>
        )
      })}

      <Button asChild variant="outline">
        <Link href="/#features">View the grid on site</Link>
      </Button>
    </AdminWriteScope>
  )
}
