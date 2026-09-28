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
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { statValue } from '@/lib/cms/content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PROVIDERS } from '@/lib/ai/catalogue'
import { MODELS } from '@/lib/ai/registry'
import { cmsList } from '@/services/cms/crud'
import { getStatSources } from '@/services/cms/content.service'
import { signupGrant } from '@/services/cms/credits.service'
import type { SiteStatRow, StatValueKind } from '@/types/cms'

import {
  createStat,
  deleteStat,
  reorderStats,
  setStatVisible,
  updateStat,
} from '../_actions/content'

/**
 * The statistics band.
 *
 * The interesting column is `value_kind`, and the screen is built around explaining it:
 * a stat is either a number an operator typed, or a number the platform counts. Both
 * are legitimate and they mean different things, so the table shows the live value
 * beside each row — a counted stat that currently resolves to nothing is exactly the
 * one somebody needs to know about, because it does not render.
 *
 * A counted stat with a zero source prints nothing rather than "0". "0 Creators" on a
 * landing page is worse than three cells instead of four, which is why the preview
 * column says "hidden — counts zero" rather than showing a zero.
 */

const KINDS: { value: StatValueKind; label: string }[] = [
  { value: 'literal', label: 'A number I type' },
  { value: 'models', label: 'Counted: models in the registry' },
  { value: 'presets', label: 'Counted: active presets' },
  { value: 'providers', label: 'Counted: providers that can generate' },
  { value: 'signup_credits', label: 'Counted: the signup grant' },
  { value: 'creators', label: 'Counted: people who have published' },
  { value: 'projects', label: 'Counted: projects' },
  { value: 'assets', label: 'Counted: generated files' },
  { value: 'public_generations', label: 'Counted: published shots' },
  { value: 'countries', label: 'Counted: billing countries seen' },
]

const FIELDS: FieldSpec[] = [
  {
    kind: 'text',
    name: 'key',
    label: 'Key',
    mono: true,
    half: true,
    required: true,
    help: 'Stable identifier. Lower-case, letters, numbers and underscores.',
  },
  { kind: 'text', name: 'label', label: 'Label', half: true, required: true },
  {
    kind: 'select',
    name: 'value_kind',
    label: 'Where the number comes from',
    options: KINDS,
    help: 'A counted stat cannot go stale. A typed one says so by not counting anything.',
  },
  {
    kind: 'text',
    name: 'literal_value',
    label: 'Value (typed stats only)',
    half: true,
    help: 'Required when the source is “a number I type”. Ignored otherwise.',
  },
  {
    kind: 'text',
    name: 'detail',
    label: 'Detail line',
    half: true,
    help: 'The small grey line under the label: “image and video”, “no card required”.',
  },
  { kind: 'text', name: 'prefix', label: 'Prefix', half: true, help: 'Rendered before the number.' },
  { kind: 'text', name: 'suffix', label: 'Suffix', half: true, help: 'Rendered after it — “+”, “k”.' },
  { kind: 'boolean', name: 'is_visible', label: 'Visible' },
]

function initialFor(row: SiteStatRow) {
  return {
    key: row.key,
    label: row.label,
    value_kind: row.value_kind,
    literal_value: row.literal_value ?? '',
    detail: row.detail ?? '',
    prefix: row.prefix ?? '',
    suffix: row.suffix ?? '',
    is_visible: row.is_visible,
  }
}

export default async function AdminStatisticsPage() {
  const actor = await requireCapability('content:read', '/admin/statistics')
  const canWrite = can(actor.role, 'content:write')

  const readyProviders = PROVIDERS.filter((provider) => provider.generationReady).length

  const [rows, sources] = await Promise.all([
    cmsList('site_stats', { orderBy: 'sort_order' }),
    signupGrant().then((credits) =>
      getStatSources({ models: MODELS.length, providers: readyProviders, signupCredits: credits }),
    ),
  ])

  const ids = rows.map((row) => row.id)

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="Content"
        title="Statistics"
        description="The four-cell numbers band under the hero. Each cell is either a figure you set or one the platform counts."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/">View on site</Link>
            </Button>
            <RecordDialog
              title="New statistic"
              fields={FIELDS}
              initial={{ value_kind: 'literal', is_visible: true }}
              action={createStat}
              submitLabel="Add the statistic"
              successMessage="Statistic added."
              resetOnSave
              columns={2}
              triggerLabel="New statistic"
            />
          </>
        }
      />

      <AdminPanel
        title="The band"
        description="Shown left to right in this order."
        footer="A counted statistic that currently resolves to zero is not rendered at all — a landing page that says “0 Creators” is worse than one with three cells."
      >
        {rows.length === 0 ? (
          <AdminEmpty
            title="No statistics configured."
            description="The landing page is counting models, presets, providers and the signup grant on its own."
          />
        ) : (
          <AdminTable
            head={
              <>
                <Th className="w-20">Order</Th>
                <Th>Label</Th>
                <Th className="w-56">Source</Th>
                <Th className="w-32">Renders as</Th>
                <Th className="w-24">Visible</Th>
                <Th className="w-36" />
              </>
            }
          >
            {rows.map((row) => {
              const resolved = statValue(
                {
                  id: row.id,
                  key: row.key,
                  label: row.label,
                  detail: row.detail,
                  valueKind: row.value_kind,
                  literalValue: row.literal_value,
                  prefix: row.prefix,
                  suffix: row.suffix,
                  sortOrder: row.sort_order,
                },
                sources,
              )

              return (
                <tr key={row.id}>
                  <Td>
                    <ReorderButtons ids={ids} id={row.id} action={reorderStats} label={row.label} />
                  </Td>

                  <Td>
                    <p className="font-medium">{row.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.detail ?? <span className="opacity-60">no detail line</span>}
                    </p>
                  </Td>

                  <Td>
                    <Badge variant={row.value_kind === 'literal' ? 'secondary' : 'default'}>
                      {KINDS.find((kind) => kind.value === row.value_kind)?.label ?? row.value_kind}
                    </Badge>
                  </Td>

                  <Td>
                    {resolved ? (
                      <span className="font-display text-lg font-semibold tabular-nums">
                        {row.prefix ?? ''}
                        {resolved}
                        {row.suffix ?? ''}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">hidden — counts zero</span>
                    )}
                  </Td>

                  <Td>
                    <ToggleAction
                      checked={row.is_visible}
                      action={setStatVisible.bind(null, row.id)}
                      label={`Show the “${row.label}” statistic`}
                    />
                  </Td>

                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <RecordDialog
                        title={`Edit “${row.label}”`}
                        fields={FIELDS.filter((field) => field.name !== 'key')}
                        initial={initialFor(row)}
                        action={updateStat.bind(null, row.id)}
                        columns={2}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        action={deleteStat.bind(null, row.id)}
                        what="this statistic"
                        description={<>The “{row.label}” cell will be removed from the band.</>}
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

      <AdminPanel
        title="What the counters currently return"
        description="Read live, the same way the landing page reads them. Useful for checking a stat before you publish it."
      >
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['Models in the registry', sources.models],
              ['Active presets', sources.presets],
              ['Providers that can generate', sources.providers],
              ['Signup grant', sources.signupCredits],
              ['People who have published', sources.creators],
              ['Projects', sources.projects],
              ['Generated files', sources.assets],
              ['Published shots', sources.publicGenerations],
              ['Billing countries', sources.countries],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value.toLocaleString('en-GB')}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>
    </AdminWriteScope>
  )
}
