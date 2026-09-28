import { Star } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  ResultCount,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import {
  ActionButton,
  DeleteButton,
  FilterChips,
  Pager,
  SearchFilter,
  ToggleAction,
} from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { MODELS } from '@/lib/ai/registry'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listPresetCategories, listPresets } from '@/services/admin/presets.service'
import type { PresetKind, PresetRow } from '@/types/database'

import {
  addPreset,
  editPreset,
  removePreset,
  togglePresetActive,
  togglePresetFeatured,
} from '../_actions/catalogue'

/**
 * Prompt presets.
 *
 * The one rule this screen enforces that no database constraint can: `model_id` has to
 * name a model in lib/ai/registry.ts. The registry is code, so Postgres cannot check it —
 * and a preset pointing at a model that no longer exists fails at Generate, after somebody
 * has chosen it and typed a prompt. So the field is a dropdown of real models rather than
 * a text input, and the action re-checks it.
 *
 * `prompt_fragment` deserves the warning it carries. It is hidden prompt engineering
 * appended to whatever the user wrote, so editing it changes what every future generation
 * using this preset actually asks the model for. The audit trail records the change.
 *
 * `params` is deliberately absent from this form. It is model-specific inference
 * configuration — step counts, guidance scales, frame rates — and a wrong value produces a
 * 422 from the provider that the user is charged for. That belongs with the seed script,
 * which has the model's input schema in front of it.
 */

const PAGE_SIZE = 30

const KINDS: { value: PresetKind; label: string }[] = [
  { value: 'motion', label: 'Motion — a camera move' },
  { value: 'style', label: 'Style — a look' },
]

function fields(categories: string[]): FieldSpec[] {
  return [
    {
      kind: 'text',
      name: 'slug',
      label: 'Slug',
      required: true,
      mono: true,
      half: true,
      help: 'The ?preset= deep link. Lower-case letters, numbers and hyphens.',
    },
    { kind: 'text', name: 'title', label: 'Title', required: true, half: true },
    { kind: 'select', name: 'kind', label: 'Kind', options: KINDS, half: true },
    {
      kind: 'text',
      name: 'category',
      label: 'Category',
      required: true,
      half: true,
      help:
        categories.length > 0
          ? `In use: ${categories.join(', ')}`
          : 'How the gallery groups this preset.',
    },
    {
      kind: 'textarea',
      name: 'description',
      label: 'Description',
      rows: 2,
      help: 'What the preset does, for the card in the gallery.',
    },
    {
      kind: 'select',
      name: 'model_id',
      label: 'Model',
      options: MODELS.map((model) => ({
        value: model.id,
        label: `${model.label} — ${model.credits} credits, ${model.family}`,
      })),
      help: 'Must be a model in the registry. A preset pointing anywhere else fails at Generate.',
    },
    {
      kind: 'textarea',
      name: 'prompt_fragment',
      label: 'Prompt fragment',
      required: true,
      rows: 4,
      mono: true,
      help: 'Appended to whatever the user writes. Editing this changes what every future generation with this preset asks for.',
    },
    {
      kind: 'textarea',
      name: 'negative_prompt',
      label: 'Negative prompt',
      rows: 2,
      mono: true,
      help: 'What to exclude. Ignored by models that do not support one.',
    },
    {
      kind: 'text',
      name: 'preview_video_url',
      label: 'Preview video',
      help: 'The looping preview on the gallery card.',
    },
    { kind: 'text', name: 'preview_poster_url', label: 'Preview poster', help: 'The still behind it.' },
    {
      kind: 'number',
      name: 'credit_cost',
      label: 'Extra credit cost',
      half: true,
      min: 0,
      unit: 'credits',
      help: 'Added on top of the model’s own price. Usually zero.',
    },
    { kind: 'text', name: 'accent', label: 'Accent colour', mono: true, half: true },
    { kind: 'boolean', name: 'is_featured', label: 'Featured in the gallery' },
    { kind: 'boolean', name: 'is_active', label: 'Available to users' },
  ]
}

function initialFor(row: PresetRow) {
  return {
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    category: row.category,
    description: row.description ?? '',
    model_id: row.model_id,
    prompt_fragment: row.prompt_fragment,
    negative_prompt: row.negative_prompt ?? '',
    preview_video_url: row.preview_video_url ?? '',
    preview_poster_url: row.preview_poster_url ?? '',
    credit_cost: row.credit_cost,
    accent: row.accent ?? '',
    is_featured: row.is_featured,
    is_active: row.is_active,
  }
}

const MODEL_IDS = new Set(MODELS.map((model) => model.id))

export default async function AdminPresetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; category?: string; page?: string }>
}) {
  const actor = await requireCapability('content:read', '/admin/presets')
  const canWrite = can(actor.role, 'content:write')
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [result, categories] = await Promise.all([
    listPresets({
      search: params.q,
      kind: params.kind as PresetKind | undefined,
      category: params.category,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listPresetCategories(),
  ])

  const spec = fields(categories)
  const broken = result.presets.filter((row) => !MODEL_IDS.has(row.model_id))
  const active = result.presets.filter((row) => row.is_active).length

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="AI"
        title="Prompt presets"
        description="The camera moves and film styles the composer offers. Each one pins a prompt fragment, a negative prompt and a model."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/presets">View the gallery</a>
            </Button>
            <RecordDialog
              title="New preset"
              description="The prompt fragment is the preset. Everything else decides how it is presented and what it runs on."
              fields={spec}
              initial={{
                kind: 'motion',
                model_id: MODELS[0]?.id ?? '',
                credit_cost: 0,
                is_active: true,
                is_featured: false,
              }}
              action={addPreset}
              submitLabel="Create the preset"
              successMessage="Preset created."
              resetOnSave
              columns={2}
              triggerLabel="New preset"
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Presets" value={result.total} detail={`${active} active on this page`} />
        <StatTile label="Categories" value={categories.length} detail="in use" />
        <StatTile
          label="Pointing at a missing model"
          value={broken.length}
          detail={broken.length > 0 ? 'these would fail at Generate' : 'all models resolve'}
          tone={broken.length > 0 ? 'warn' : 'default'}
        />
      </div>

      {broken.length > 0 && (
        <AdminPanel title="These presets cannot run">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Their <code className="font-mono">model_id</code> is not in the registry, so choosing one
            in the composer produces “That model no longer exists” after the user has typed a prompt.
            Repoint each one at a model that exists, or retire it.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {broken.map((row) => (
              <li key={row.id} className="font-mono text-xs text-danger">
                {row.slug} → {row.model_id}
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      <AdminPanel
        title="Catalogue"
        actions={<SearchFilter placeholder="Search title, slug or description" className="w-64" />}
        footer="Retiring a preset removes it from every browse surface and keeps the lineage of everything made with it. Deleting is only offered for a preset nothing has used."
      >
        <div className="space-y-3">
          <FilterChips paramName="kind" options={KINDS} allLabel="Both kinds" />
          {categories.length > 0 && (
            <FilterChips
              paramName="category"
              options={categories.map((category) => ({ value: category, label: category }))}
              allLabel="All categories"
            />
          )}
        </div>

        {result.presets.length === 0 ? (
          <AdminEmpty
            title="Nothing matches."
            description="Clear the filters, or create a preset."
          />
        ) : (
          <>
            <div className="mt-5">
              <AdminTable
                head={
                  <>
                    <Th>Preset</Th>
                    <Th className="w-28">Kind</Th>
                    <Th className="w-36">Model</Th>
                    <Th numeric className="w-20">
                      Extra
                    </Th>
                    <Th className="w-24">Featured</Th>
                    <Th className="w-24">Active</Th>
                    <Th className="w-44" />
                  </>
                }
              >
                {result.presets.map((row) => {
                  const model = MODELS.find((entry) => entry.id === row.model_id)

                  return (
                    <tr key={row.id}>
                      <Td className="max-w-[24rem]">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {row.title}
                          {!row.is_active && (
                            <Badge variant="secondary" className="text-[10px]">
                              retired
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {row.slug} · {row.category}
                        </p>
                        <p className="mt-1 line-clamp-1 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
                          {row.prompt_fragment}
                        </p>
                      </Td>

                      <Td>
                        <Badge variant={row.kind === 'motion' ? 'default' : 'accent'}>
                          {row.kind}
                        </Badge>
                      </Td>

                      <Td>
                        {model ? (
                          <>
                            <p className="text-xs">{model.label}</p>
                            <p className="mt-0.5 text-[11px] tabular-nums text-credit">
                              {model.credits} credits
                            </p>
                          </>
                        ) : (
                          <Badge variant="destructive" className="font-mono text-[10px]">
                            {row.model_id}
                          </Badge>
                        )}
                      </Td>

                      <Td numeric className="text-xs text-muted-foreground">
                        {row.credit_cost || '—'}
                      </Td>

                      <Td>
                        <ToggleAction
                          checked={row.is_featured}
                          action={togglePresetFeatured.bind(null, row.id)}
                          label={`Feature the ${row.title} preset`}
                        />
                      </Td>

                      <Td>
                        <ToggleAction
                          checked={row.is_active}
                          action={togglePresetActive.bind(null, row.id)}
                          label={`Make the ${row.title} preset available`}
                        />
                      </Td>

                      <Td>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <RecordDialog
                            title={`Edit “${row.title}”`}
                            fields={spec}
                            initial={initialFor(row)}
                            action={editPreset.bind(null, row.id)}
                            columns={2}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />

                          {row.is_active && (
                            <ActionButton
                              action={togglePresetActive.bind(null, row.id, false)}
                              icon="archive"
                              variant="ghost"
                              size="icon-sm"
                              successMessage="Retired."
                              confirm={{
                                title: `Retire “${row.title}”?`,
                                description:
                                  'It disappears from the gallery and the composer. Everything already made with it keeps its lineage, and you can reactivate it at any time.',
                                confirmLabel: 'Retire it',
                                tone: 'default',
                              }}
                            >
                              <span className="sr-only">Retire {row.title}</span>
                            </ActionButton>
                          )}

                          <DeleteButton
                            action={removePreset.bind(null, row.id)}
                            what={`“${row.title}”`}
                            description="Only possible if nothing has been generated with it. If anything has, retire it instead — deleting would break the lineage of those shots."
                            iconOnly
                          />
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </AdminTable>
            </div>

            <ResultCount shown={result.presets.length} total={result.total} noun="presets" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Star className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Inference parameters — step counts, guidance scales, frame rates — are not editable here. A
        wrong value there produces a provider error the user is charged for, so they stay with the
        seed script, which has each model’s input schema in front of it.
      </p>
    </AdminWriteScope>
  )
}
