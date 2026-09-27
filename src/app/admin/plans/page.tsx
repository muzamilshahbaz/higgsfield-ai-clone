import Link from 'next/link'
import { Check, Minus } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  DetailRow,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ReorderButtons, ToggleAction } from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { PLAN_IDS } from '@/lib/plans'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listPlanFeatureRows, listPlanRows } from '@/services/cms/plans.service'
import type { PlanFeatureRow, PlanRow } from '@/types/cms'

import {
  createPlanFeature,
  deletePlanFeature,
  reorderPlanFeatures,
  setPlanFeatureVisible,
  setPlanVisible,
  updatePlan,
  updatePlanFeature,
} from '../_actions/commerce'

/**
 * Plans and the comparison matrix.
 *
 * The screen an operator should read a warning on before touching, so it carries one:
 * two of the numbers on a plan are not marketing. `max_concurrent_jobs` and
 * `max_generations_per_hour` are handed to the generation service by `planForUser`, so
 * editing them changes what everybody on that tier can do — immediately, on their next
 * Generate click.
 *
 * There is no Create. `subscriptions.plan` is the `plan_tier` Postgres enum, so a fourth
 * tier could be written to this table and could never be assigned to anybody: it would
 * be a pricing card that fails at checkout. Adding one is a migration, and the panel says
 * so rather than offering a button that leads somewhere broken.
 */

const BILLING_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'lifetime', label: 'One-off' },
  { value: 'none', label: 'Not billed' },
]

const PLAN_FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'name', label: 'Name', required: true, half: true },
  {
    kind: 'number',
    name: 'price_usd',
    label: 'Price',
    half: true,
    min: 0,
    step: 1,
    unit: 'USD',
    help: 'Whole dollars or two decimals. Charged at checkout from this value.',
  },
  {
    kind: 'textarea',
    name: 'tagline',
    label: 'Tagline',
    rows: 2,
    help: 'The line under the plan name on the card.',
  },
  {
    kind: 'text',
    name: 'cadence',
    label: 'Cadence label',
    half: true,
    help: 'The words beside the price: “per month”, “forever”. Display only.',
  },
  {
    kind: 'select',
    name: 'billing_period',
    label: 'Billing period',
    options: BILLING_PERIODS,
    half: true,
    help: 'What the renewal arithmetic uses.',
  },
  {
    kind: 'number',
    name: 'credits',
    label: 'Credits',
    half: true,
    min: 0,
    unit: 'credits',
    help: 'On a paid plan this is reset — not added — on each renewal. On free it is the signup grant.',
  },
  {
    kind: 'number',
    name: 'rank',
    label: 'Rank',
    half: true,
    min: 0,
    help: 'Decides what counts as an upgrade. Comparing prices would break the moment a tier is discounted.',
  },
  {
    kind: 'number',
    name: 'max_concurrent_jobs',
    label: 'Concurrent renders',
    half: true,
    min: 1,
    help: 'ENFORCED. The generation service refuses a submission past this. One is the minimum, or nobody on this tier can generate.',
  },
  {
    kind: 'number',
    name: 'max_generations_per_hour',
    label: 'Generations per hour',
    half: true,
    min: 1,
    help: 'ENFORCED, in Postgres, per rolling hour.',
  },
  {
    kind: 'tags',
    name: 'perks',
    label: 'Perks',
    help: 'The short list on the pricing card. One per line — press Enter after each.',
  },
  { kind: 'text', name: 'cta_label', label: 'Button label', half: true },
  {
    kind: 'boolean',
    name: 'is_popular',
    label: 'Most popular',
    help: 'Highlights the card. Only one tier should carry it.',
  },
  { kind: 'boolean', name: 'is_visible', label: 'Shown on the pricing page' },
]

const MATRIX_FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'label', label: 'Row label', required: true },
  {
    kind: 'json',
    name: 'values',
    label: 'Values by plan',
    rows: 6,
    help: 'A JSON object keyed by plan id. `true` renders a tick, `false` a dash, a string renders as itself. A plan you leave out renders as a dash.',
  },
  { kind: 'boolean', name: 'is_visible', label: 'Visible' },
]

function planInitial(row: PlanRow) {
  return {
    name: row.name,
    price_usd: Number(row.price_usd),
    tagline: row.tagline,
    cadence: row.cadence,
    billing_period: row.billing_period,
    credits: row.credits,
    rank: row.rank,
    max_concurrent_jobs: row.max_concurrent_jobs,
    max_generations_per_hour: row.max_generations_per_hour,
    perks: row.perks,
    cta_label: row.cta_label ?? '',
    is_popular: row.is_popular,
    is_visible: row.is_visible,
  }
}

function matrixInitial(row: PlanFeatureRow) {
  return {
    label: row.label,
    values: JSON.stringify(row.values ?? {}, null, 2),
    is_visible: row.is_visible,
  }
}

/** One matrix cell, rendered the way the public comparison table renders it. */
function MatrixCell({ value }: { value: unknown }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label="Included" />
  if (value === false || value === null || value === undefined) {
    return <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not included" />
  }
  return <span className="text-xs tabular-nums">{String(value)}</span>
}

export default async function AdminPlansPage() {
  const actor = await requireCapability('billing:read', '/admin/plans')
  const canWrite = can(actor.role, 'billing:write')

  const [plans, matrix] = await Promise.all([listPlanRows(), listPlanFeatureRows()])
  const matrixIds = matrix.map((row) => row.id)

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Plans"
        description="The three tiers and the comparison table under them. Two of the numbers here are enforced by the generation service, not just displayed."
        actions={
          <Button asChild variant="outline">
            <Link href="/#pricing">View the pricing page</Link>
          </Button>
        }
      />

      <AdminPanel title="Why there is no “New plan” button">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          A subscription records its tier in the <code className="font-mono">plan_tier</code> Postgres
          enum, which has exactly three values: {PLAN_IDS.join(', ')}. A fourth row in this table
          could be priced and displayed, and then could never be assigned to anybody — checkout would
          fail at the point of writing the subscription. Adding a tier is a migration that extends the
          enum, and offering a button that leads somewhere broken would be worse than not having one.
        </p>
      </AdminPanel>

      {plans.length === 0 ? (
        <AdminEmpty
          title="No plan rows."
          description="The pricing page is reading the catalogue in lib/plans.ts. Applying migration 0017 seeds this table with the same values."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <AdminPanel
              key={plan.id}
              title={plan.name}
              description={plan.tagline}
              actions={
                plan.is_popular ? <Badge variant="default">Most popular</Badge> : undefined
              }
              footer={
                canWrite ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      Shown on the pricing page
                      <ToggleAction
                        checked={plan.is_visible}
                        action={setPlanVisible.bind(null, plan.id)}
                        label={`Show the ${plan.name} plan`}
                      />
                    </span>
                    <RecordDialog
                      title={`Edit the ${plan.name} plan`}
                      description="The two limit fields are enforced by the generation service. Changing them affects everybody on this tier immediately."
                      fields={PLAN_FIELDS}
                      initial={planInitial(plan)}
                      action={updatePlan.bind(null, plan.id)}
                      columns={2}
                      trigger={
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      }
                    />
                  </div>
                ) : undefined
              }
            >
              <p className="font-display text-3xl font-semibold tabular-nums">
                ${Number(plan.price_usd).toLocaleString('en-GB', { minimumFractionDigits: 0 })}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {plan.cadence}
                </span>
              </p>

              <dl className="mt-4">
                <DetailRow label="Credits">
                  <span className="tabular-nums text-credit">
                    {plan.credits.toLocaleString('en-GB')}
                  </span>
                </DetailRow>
                <DetailRow label="Concurrent renders">
                  <span className="tabular-nums">{plan.max_concurrent_jobs}</span>
                </DetailRow>
                <DetailRow label="Per hour">
                  <span className="tabular-nums">{plan.max_generations_per_hour}</span>
                </DetailRow>
                <DetailRow label="Rank">
                  <span className="tabular-nums">{plan.rank}</span>
                </DetailRow>
                <DetailRow label="Billing">{plan.billing_period}</DetailRow>
              </dl>

              {plan.perks.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-xs leading-relaxed">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                      {perk}
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>
          ))}
        </div>
      )}

      <AdminPanel
        title="Comparison table"
        description="The matrix under the pricing cards. A plan left out of a row renders as a dash, so a row does not have to name every tier to be publishable."
        actions={
          canWrite ? (
            <RecordDialog
              title="New comparison row"
              fields={MATRIX_FIELDS}
              initial={{
                values: JSON.stringify({ free: false, pro: true, enterprise: true }, null, 2),
                is_visible: true,
              }}
              action={createPlanFeature}
              submitLabel="Add the row"
              successMessage="Row added."
              resetOnSave
              triggerLabel="New row"
              triggerVariant="outline"
            />
          ) : undefined
        }
      >
        {matrix.length === 0 ? (
          <AdminEmpty
            title="No comparison rows."
            description="The pricing page is rendering the matrix from lib/plans.ts."
          />
        ) : (
          <AdminTable
            head={
              <>
                {canWrite && <Th className="w-20">Order</Th>}
                <Th>Row</Th>
                {plans.map((plan) => (
                  <Th key={plan.id} className="w-28 text-center">
                    {plan.name}
                  </Th>
                ))}
                <Th className="w-24">Visible</Th>
                {canWrite && <Th className="w-36" />}
              </>
            }
          >
            {matrix.map((row) => {
              const values = (row.values ?? {}) as Record<string, unknown>
              return (
                <tr key={row.id}>
                  {canWrite && (
                    <Td>
                      <ReorderButtons
                        ids={matrixIds}
                        id={row.id}
                        action={reorderPlanFeatures}
                        label={row.label}
                      />
                    </Td>
                  )}
                  <Td className="font-medium">{row.label}</Td>
                  {plans.map((plan) => (
                    <Td key={plan.id} className="text-center">
                      <MatrixCell value={values[plan.id]} />
                    </Td>
                  ))}
                  <Td>
                    {canWrite ? (
                      <ToggleAction
                        checked={row.is_visible}
                        action={setPlanFeatureVisible.bind(null, row.id)}
                        label={`Show the “${row.label}” row`}
                      />
                    ) : (
                      <Badge variant={row.is_visible ? 'success' : 'secondary'}>
                        {row.is_visible ? 'Yes' : 'No'}
                      </Badge>
                    )}
                  </Td>
                  {canWrite && (
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <RecordDialog
                          title={`Edit “${row.label}”`}
                          fields={MATRIX_FIELDS}
                          initial={matrixInitial(row)}
                          action={updatePlanFeature.bind(null, row.id)}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton
                          action={deletePlanFeature.bind(null, row.id)}
                          what="this comparison row"
                          description={<>“{row.label}” will be removed from the table.</>}
                          iconOnly
                        />
                      </div>
                    </Td>
                  )}
                </tr>
              )
            })}
          </AdminTable>
        )}
      </AdminPanel>
    </>
  )
}
