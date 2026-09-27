import Link from 'next/link'
import { Lock, Zap } from 'lucide-react'

import {
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec, MediaOption } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { TASK_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getModelViews,
  listModelRows,
  longestDurationCost,
  undescribedModelIds,
} from '@/services/cms/catalogue.service'
import { getProviderViews } from '@/services/cms/catalogue.service'
import { listMedia } from '@/services/cms/media.service'
import type { AiModelRow } from '@/types/cms'
import type { GenerationTask } from '@/types/database'

import { reorderModels, setModelFeatured, setModelOnLanding, updateModel } from '../_actions/catalogue'

/**
 * AI models.
 *
 * The screen where the CMS boundary is most worth stating, so the panel states it: this
 * table decides what a visitor is TOLD about a model. It decides nothing about what a
 * model IS.
 *
 * The credit price, the providers it routes to, the aspect ratios and the durations all
 * come from lib/ai/registry.ts, are unit tested, and are what the composer charges
 * against. They are shown here as read-only columns because an operator needs to see
 * them — a marketing description that contradicts the price is worse than no description.
 * They are not editable because a CMS form that can reprice a render is a way to lose
 * money.
 *
 * `status: hidden` is likewise a display state, and the form says so: it removes a model
 * from the landing roster, not from the composer. A preset that references a model needs
 * that model to stay runnable, or the preset breaks.
 */

const TASK_ORDER: GenerationTask[] = ['text_to_image', 'image_to_video', 'text_to_video']

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'beta', label: 'Beta' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'hidden', label: 'Hidden from the site' },
]

function fields(providers: { value: string; label: string }[], media: MediaOption[]): FieldSpec[] {
  return [
    { kind: 'text', name: 'label', label: 'Display name', required: true, half: true },
    {
      kind: 'select',
      name: 'provider_id',
      label: 'Vendor named on the card',
      options: providers,
      allowEmpty: true,
      half: true,
      help: 'Should match the first route in the registry — the one the router tries first, and therefore the account that gets billed.',
    },
    {
      kind: 'textarea',
      name: 'description',
      label: 'Description',
      rows: 3,
      help: 'What somebody would reach for it to do. Shown on the model card.',
    },
    {
      kind: 'text',
      name: 'basis',
      label: 'Open model underneath',
      half: true,
      help: 'Named plainly: “FLUX.1 [schnell]”. This is what makes the roster honest.',
    },
    { kind: 'text', name: 'use_case', label: 'Use case', half: true, placeholder: 'Finished stills' },
    { kind: 'text', name: 'category', label: 'Category', half: true, placeholder: 'image' },
    { kind: 'tags', name: 'tags', label: 'Tags' },
    { kind: 'tags', name: 'capabilities', label: 'Capabilities' },
    { kind: 'tags', name: 'input_types', label: 'Input types', placeholder: 'text, image' },
    { kind: 'tags', name: 'output_types', label: 'Output types', placeholder: 'image' },
    ...(media.length > 0
      ? ([{ kind: 'media', name: 'media_id', label: 'Card image' }] as FieldSpec[])
      : []),
    { kind: 'text', name: 'image_url', label: 'Card image URL', help: 'If not using the library.' },
    {
      kind: 'select',
      name: 'status',
      label: 'Status',
      options: STATUSES,
      half: true,
      help: 'Hidden removes it from the landing roster. It does NOT remove it from the composer — a preset that points at it has to keep working.',
    },
    { kind: 'boolean', name: 'is_recommended', label: 'Recommended' },
    { kind: 'boolean', name: 'is_featured', label: 'Featured on the landing page' },
    { kind: 'boolean', name: 'show_on_landing', label: 'Listed in the model roster' },
  ]
}

function initialFor(row: AiModelRow) {
  return {
    label: row.label,
    provider_id: row.provider_id ?? '',
    description: row.description,
    basis: row.basis ?? '',
    use_case: row.use_case ?? '',
    category: row.category ?? '',
    tags: row.tags,
    capabilities: row.capabilities,
    input_types: row.input_types,
    output_types: row.output_types,
    media_id: row.media_id ?? '',
    image_url: row.image_url ?? '',
    status: row.status,
    is_recommended: row.is_recommended,
    is_featured: row.is_featured,
    show_on_landing: row.show_on_landing,
  }
}

export default async function AdminModelsPage() {
  const actor = await requireCapability('providers:read', '/admin/models')
  const canWrite = can(actor.role, 'providers:write')

  const [views, rows, providers, undescribed, mediaResult] = await Promise.all([
    getModelViews(),
    listModelRows(),
    getProviderViews(),
    undescribedModelIds(),
    listMedia({ includeInactive: false, limit: 60 }),
  ])

  const media: MediaOption[] = mediaResult.items.map((item) => ({
    id: item.id,
    label: item.title ?? item.slug,
    url: item.url,
    folder: item.folder,
  }))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const spec = fields(
    providers.map((provider) => ({ value: provider.id, label: provider.label })),
    media,
  )

  const onLanding = views.filter((view) => view.showOnLanding && view.status !== 'hidden')
  const featured = views.filter((view) => view.isFeatured)

  return (
    <>
      <AdminPageHeader
        eyebrow="AI"
        title="Models"
        description="How each model in the registry is presented. The numbers beside each one come from the registry and are not editable here."
        actions={
          <Button asChild variant="outline">
            <Link href="/#models">View the roster</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="In the registry" value={views.length} detail="every runnable model" />
        <StatTile
          label="Listed on the site"
          value={onLanding.length}
          detail={`${featured.length} featured`}
          tone="brand"
        />
        <StatTile
          label="Not yet described"
          value={undescribed.length}
          detail={undescribed.length > 0 ? 'using their registry blurb' : 'all described'}
          tone={undescribed.length > 0 ? 'warn' : 'default'}
        />
      </div>

      <AdminPanel title="What this screen can and cannot change">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="eyebrow text-brand">Editable here</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>The display name and description</li>
              <li>The card image, tags and categories</li>
              <li>Recommended, featured, and landing visibility</li>
              <li>Which vendor the badge names</li>
            </ul>
          </div>
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              From the code, read-only
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>The credit price and the provider routes</li>
              <li>Supported aspect ratios and durations</li>
              <li>Which task the model performs</li>
              <li>Whether it can run at all</li>
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Those live in <code className="font-mono">lib/ai/registry.ts</code>, are unit tested,
              and are what a generation is charged against.
            </p>
          </div>
        </div>
      </AdminPanel>

      {TASK_ORDER.map((task) => {
        const group = views.filter((view) => view.task === task)
        if (group.length === 0) return null
        const ids = group.map((view) => view.id)

        return (
          <AdminPanel key={task} title={TASK_LABELS[task]} description={`${group.length} model${group.length === 1 ? '' : 's'}`}>
            <AdminTable
              head={
                <>
                  {canWrite && <Th className="w-20">Order</Th>}
                  <Th>Model</Th>
                  <Th className="w-28">Vendor</Th>
                  <Th numeric className="w-24">
                    Credits
                  </Th>
                  <Th numeric className="w-24">
                    Latency
                  </Th>
                  <Th className="w-24">Featured</Th>
                  <Th className="w-24">Listed</Th>
                  <Th className="w-28" />
                </>
              }
            >
              {group.map((view) => {
                const row = byId.get(view.id)
                const longCost = longestDurationCost(view)

                return (
                  <tr key={view.id}>
                    {canWrite && (
                      <Td>
                        <ReorderButtons
                          ids={ids}
                          id={view.id}
                          action={reorderModels}
                          label={view.label}
                        />
                      </Td>
                    )}

                    <Td className="max-w-[26rem]">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {view.label}
                        {view.isRecommended && (
                          <Badge variant="default" className="text-[10px]">
                            recommended
                          </Badge>
                        )}
                        {view.status === 'hidden' && (
                          <Badge variant="secondary" className="text-[10px]">
                            hidden
                          </Badge>
                        )}
                        {!row && (
                          <Badge variant="warning" className="text-[10px]">
                            not described
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {view.id} · {view.basis}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {view.description}
                      </p>
                    </Td>

                    <Td>
                      <p className="text-xs">{view.provider}</p>
                      {view.providers.length > 1 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          +{view.providers.length - 1} fallback
                        </p>
                      )}
                    </Td>

                    <Td numeric className="text-credit">
                      {view.credits}
                      {longCost && longCost !== view.credits && (
                        <span className="block text-[11px] text-muted-foreground">
                          up to {longCost}
                        </span>
                      )}
                    </Td>

                    <Td numeric className="text-xs text-muted-foreground">
                      ~{view.avgLatencySec}s
                    </Td>

                    <Td>
                      {canWrite ? (
                        <ToggleAction
                          checked={view.isFeatured}
                          action={setModelFeatured.bind(null, view.id)}
                          label={`Feature ${view.label}`}
                        />
                      ) : (
                        <Badge variant={view.isFeatured ? 'success' : 'secondary'}>
                          {view.isFeatured ? 'Yes' : 'No'}
                        </Badge>
                      )}
                    </Td>

                    <Td>
                      {canWrite ? (
                        <ToggleAction
                          checked={view.showOnLanding}
                          action={setModelOnLanding.bind(null, view.id)}
                          label={`List ${view.label} on the landing page`}
                        />
                      ) : (
                        <Badge variant={view.showOnLanding ? 'success' : 'secondary'}>
                          {view.showOnLanding ? 'Yes' : 'No'}
                        </Badge>
                      )}
                    </Td>

                    <Td>
                      {canWrite && (
                        <div className="flex justify-end">
                          <RecordDialog
                            title={`Edit ${view.label}`}
                            description="Presentation only. The price, the routes and the supported sizes come from the registry."
                            fields={spec}
                            initial={row ? initialFor(row) : {
                              label: view.label,
                              description: view.description,
                              basis: view.basis,
                              status: 'active',
                              show_on_landing: true,
                            }}
                            action={updateModel.bind(null, view.id)}
                            mediaOptions={media}
                            columns={2}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                        </div>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </AdminTable>
          </AdminPanel>
        )
      })}

      {undescribed.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed">
          <Zap className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            {undescribed.length} model{undescribed.length === 1 ? '' : 's'} in the registry have no
            row in this table yet: <code className="font-mono">{undescribed.join(', ')}</code>. They
            render with the blurb from the registry, which works — editing one here takes over.
          </span>
        </p>
      )}
    </>
  )
}
