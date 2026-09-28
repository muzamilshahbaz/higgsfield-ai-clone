import { Lock } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { resolveIcon } from '@/lib/admin/icons'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { CATEGORY_TAGS } from '@/lib/categories'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cmsList } from '@/services/cms/crud'
import type { CategoryScope, ContentCategoryRow } from '@/types/cms'

import {
  createCategory,
  deleteCategory,
  reorderCategories,
  setCategoryVisible,
  updateCategory,
} from '../_actions/content'

/**
 * Category vocabularies, one table with a scope.
 *
 * Four near-identical tables would have meant four near-identical screens. `scope`
 * makes it one, and the difference between the scopes is what each one is *for* —
 * which the panels say, because one of them is not what an operator would assume.
 *
 * The Explore scope is metadata only. The enforcement point for what a published shot
 * may be tagged with is the `generations_categories_allowed` check constraint, mirrored
 * by lib/categories.ts and guarded by tests/categories.test.ts. A row added here cannot
 * widen that vocabulary — it can only change how an existing slug is labelled and
 * ordered. The panel says so, and the slugs the constraint actually allows are listed
 * beside it, because the alternative is an operator adding a category, tagging nothing
 * with it, and concluding the feature is broken.
 */

const SCOPES: {
  value: CategoryScope
  label: string
  description: string
  constrained?: boolean
}[] = [
  {
    value: 'preset',
    label: 'Preset categories',
    description:
      'How the preset gallery groups camera moves and film styles. Free-form — a preset’s category is a text column.',
  },
  {
    value: 'explore',
    label: 'Explore categories',
    description:
      'Labels and ordering for the published-work filters. The slugs themselves are fixed by a database constraint.',
    constrained: true,
  },
  {
    value: 'model',
    label: 'Model categories',
    description: 'How the model roster is grouped on the landing page.',
  },
  {
    value: 'media',
    label: 'Media tags',
    description: 'Extra vocabulary for the media library, beyond its fixed categories.',
  },
]

const FIELDS: FieldSpec[] = [
  {
    kind: 'select',
    name: 'scope',
    label: 'Vocabulary',
    options: SCOPES.map((scope) => ({ value: scope.value, label: scope.label })),
    half: true,
  },
  {
    kind: 'text',
    name: 'slug',
    label: 'Slug',
    mono: true,
    half: true,
    required: true,
    help: 'Lower-case, hyphens and underscores. This is what the database stores.',
  },
  { kind: 'text', name: 'label', label: 'Label', required: true, help: 'What a visitor reads.' },
  { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
  { kind: 'icon', name: 'icon', label: 'Icon' },
  { kind: 'boolean', name: 'is_visible', label: 'Visible' },
]

/** The edit form drops `scope` and `slug`: both are part of the row's identity. */
const EDIT_FIELDS = FIELDS.filter((field) => field.name !== 'scope' && field.name !== 'slug')

function initialFor(row: ContentCategoryRow) {
  return {
    label: row.label,
    description: row.description ?? '',
    icon: row.icon ?? '',
    is_visible: row.is_visible,
  }
}

export default async function AdminCategoriesPage() {
  const actor = await requireCapability('content:read', '/admin/categories')
  const canWrite = can(actor.role, 'content:write')

  const rows = await cmsList('content_categories', { orderBy: 'scope', thenBy: 'sort_order' })

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="Content"
        title="Categories"
        description="The vocabularies presets, published work, models and media are grouped by."
        actions={
          <RecordDialog
            title="New category"
            fields={FIELDS}
            initial={{ scope: 'preset', is_visible: true }}
            action={createCategory}
            submitLabel="Add the category"
            successMessage="Category added."
            resetOnSave
            columns={2}
            triggerLabel="New category"
          />
        }
      />

      {SCOPES.map((scope) => {
        const group = rows.filter((row) => row.scope === scope.value)
        const ids = group.map((row) => row.id)

        return (
          <AdminPanel
            key={scope.value}
            title={scope.label}
            description={scope.description}
            footer={
              scope.constrained ? (
                <span className="flex items-start gap-2">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    Adding a row here does not let a shot be tagged with a new category. The slugs a
                    generation may carry are fixed by the{' '}
                    <code className="font-mono">generations_categories_allowed</code> constraint and
                    are: {CATEGORY_TAGS.join(', ')}. Widening that list is a migration.
                  </span>
                </span>
              ) : undefined
            }
          >
            {group.length === 0 ? (
              <AdminEmpty title="Nothing in this vocabulary yet." />
            ) : (
              <AdminTable
                head={
                  <>
                    <Th className="w-20">Order</Th>
                    <Th>Category</Th>
                    <Th className="w-40">Slug</Th>
                    <Th className="w-24">Visible</Th>
                    <Th className="w-36" />
                  </>
                }
              >
                {group.map((row) => {
                  const Icon = row.icon ? resolveIcon(row.icon) : null
                  const enforced =
                    scope.constrained &&
                    (CATEGORY_TAGS as readonly string[]).includes(row.slug)

                  return (
                    <tr key={row.id}>
                      <Td>
                        <ReorderButtons
                          ids={ids}
                          id={row.id}
                          action={reorderCategories}
                          label={row.label}
                        />
                      </Td>

                      <Td className="max-w-[22rem]">
                        <p className="flex items-center gap-2 font-medium">
                          {Icon && <Icon className="size-4 shrink-0 text-brand" aria-hidden />}
                          {row.label}
                        </p>
                        {row.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {row.description}
                          </p>
                        )}
                      </Td>

                      <Td>
                        <span className="flex items-center gap-2">
                          <code className="font-mono text-xs text-muted-foreground">{row.slug}</code>
                          {scope.constrained &&
                            (enforced ? (
                              <Badge variant="success" className="text-[10px]">
                                in the constraint
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="text-[10px]">
                                label only
                              </Badge>
                            ))}
                        </span>
                      </Td>

                      <Td>
                        <ToggleAction
                          checked={row.is_visible}
                          action={setCategoryVisible.bind(null, row.id)}
                          label={`Show the “${row.label}” category`}
                        />
                      </Td>

                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <RecordDialog
                            title={`Edit “${row.label}”`}
                            description="The slug and vocabulary are part of this row’s identity and cannot be changed here — delete and recreate instead."
                            fields={EDIT_FIELDS}
                            initial={initialFor(row)}
                            action={updateCategory.bind(null, row.id)}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteButton
                            action={deleteCategory.bind(null, row.id)}
                            what="this category"
                            description={
                              <>
                                “{row.label}” will lose its label and ordering. Anything already
                                tagged with <code className="font-mono">{row.slug}</code> keeps the
                                tag and will render the raw slug.
                              </>
                            }
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
    </AdminWriteScope>
  )
}
