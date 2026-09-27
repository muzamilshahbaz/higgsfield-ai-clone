import Link from 'next/link'
import { ArrowRight, Info } from 'lucide-react'

import {
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { ToggleAction } from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog, RecordForm } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { getRecentTransactions } from '@/services/admin/analytics.service'
import { cmsGet } from '@/services/cms/crud'
import { getSettingsForAdmin } from '@/services/cms/settings.service'
import { listPlanRows } from '@/services/cms/plans.service'
import type { LandingSectionRow } from '@/types/cms'

import { setPlanVisible } from '../_actions/commerce'
import { updateLandingSection } from '../_actions/content'
import { saveLegalSettings } from '../_actions/system'

/**
 * The pricing page, as a page.
 *
 * Distinct from Plans, which is the numbers. This is the band: the heading a visitor
 * reads, which cards appear and in what order, and the disclaimer under them.
 *
 * That disclaimer is the reason this screen exists as its own thing. Checkout in this
 * build is simulated, the pricing page says so in a panel rather than in small print, and
 * the field cannot be saved empty — a pricing page that stops disclosing that no card is
 * charged is a pricing page that is lying. An operator who connects a real payment
 * provider rewrites the text; they do not clear it.
 */

const SECTION_FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'index_label', label: 'Number', mono: true, half: true, maxLength: 4 },
  { kind: 'text', name: 'eyebrow', label: 'Eyebrow', half: true },
  { kind: 'text', name: 'title', label: 'Heading' },
  {
    kind: 'textarea',
    name: 'lead',
    label: 'Lead paragraph',
    rows: 3,
    help: 'The landing page appends a live sentence about what the signup grant buys, computed from real model prices — so this only needs the opening claim.',
  },
  {
    kind: 'json',
    name: 'config',
    label: 'Advanced',
    rows: 4,
    help: '"align": "center" centres the heading. "show_comparison" and "show_disclaimer" control the two panels under the cards.',
  },
]

const LEGAL_FIELDS: FieldSpec[] = [
  {
    kind: 'textarea',
    name: 'legal.billing_disclaimer',
    label: 'Billing disclaimer',
    required: true,
    rows: 3,
    help: 'Shown wherever a price appears. Cannot be empty while checkout is simulated.',
  },
  {
    kind: 'textarea',
    name: 'legal.copyright',
    label: 'Copyright line',
    rows: 2,
    help: 'Printed in the footer after the year.',
  },
]

function sectionInitial(row: LandingSectionRow | null) {
  return {
    index_label: row?.index_label ?? '07',
    eyebrow: row?.eyebrow ?? 'Pricing',
    title: row?.title ?? '',
    lead: row?.lead ?? '',
    config: JSON.stringify(row?.config ?? {}, null, 2),
  }
}

export default async function AdminPricingPage() {
  const actor = await requireCapability('billing:read', '/admin/pricing')
  const canWrite = can(actor.role, 'billing:write')
  const canSettings = can(actor.role, 'settings:write')

  const [section, plans, settings, transactions] = await Promise.all([
    cmsGet('landing_sections', 'key', 'pricing'),
    listPlanRows(),
    getSettingsForAdmin(),
    getRecentTransactions(10),
  ])

  const settled = transactions.filter((row) => row.status === 'succeeded')
  const revenue = settled.reduce((total, row) => total + row.amount_pence, 0)

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Pricing page"
        description="The band itself — its heading, which cards appear, and the disclaimer under them. The numbers on each card live under Plans."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/#pricing">View on site</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/plans">
                Edit the numbers
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </>
        }
      />

      <AdminPanel
        title="Section copy"
        description="Band 07 on the landing page."
        actions={
          canWrite ? (
            <RecordDialog
              title="Edit the pricing band"
              fields={SECTION_FIELDS}
              initial={sectionInitial(section)}
              action={updateLandingSection.bind(null, 'pricing')}
              columns={2}
              trigger={
                <Button variant="outline" size="sm">
                  Edit copy
                </Button>
              }
            />
          ) : undefined
        }
      >
        <dl className="space-y-3">
          <div>
            <dt className="eyebrow text-muted-foreground">Heading</dt>
            <dd className="mt-1 font-display text-xl">{section?.title ?? '—'}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Lead</dt>
            <dd className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {section?.lead ?? '—'}
            </dd>
          </div>
        </dl>
      </AdminPanel>

      <AdminPanel
        title="Cards on the page"
        description="Which tiers a visitor sees, in rank order. Hiding a plan does not remove it from the app — a subscriber on it keeps their entitlement."
      >
        <AdminTable
          head={
            <>
              <Th>Plan</Th>
              <Th numeric className="w-24">
                Price
              </Th>
              <Th numeric className="w-28">
                Credits
              </Th>
              <Th className="w-28">Highlighted</Th>
              <Th className="w-24">Shown</Th>
            </>
          }
        >
          {plans.map((plan) => (
            <tr key={plan.id}>
              <Td>
                <p className="font-medium">{plan.name}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{plan.tagline}</p>
              </Td>
              <Td numeric>${Number(plan.price_usd)}</Td>
              <Td numeric className="text-credit">
                {plan.credits.toLocaleString('en-GB')}
              </Td>
              <Td>
                {plan.is_popular ? (
                  <Badge variant="default">Most popular</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </Td>
              <Td>
                {canWrite ? (
                  <ToggleAction
                    checked={plan.is_visible}
                    action={setPlanVisible.bind(null, plan.id)}
                    label={`Show the ${plan.name} card`}
                  />
                ) : (
                  <Badge variant={plan.is_visible ? 'success' : 'secondary'}>
                    {plan.is_visible ? 'Yes' : 'No'}
                  </Badge>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      </AdminPanel>

      <AdminPanel
        title="Disclosure"
        description="The panel under the pricing cards, and the footer line."
        footer="The disclaimer field refuses to save empty. Checkout in this build is simulated, and a pricing page that stops saying so is misleading rather than merely terse."
      >
        {canSettings ? (
          <RecordForm
            fields={LEGAL_FIELDS}
            initial={{
              'legal.billing_disclaimer': settings.legal.billingDisclaimer,
              'legal.copyright': settings.legal.copyright,
            }}
            action={saveLegalSettings}
            submitLabel="Save the disclosure"
            successMessage="Disclosure saved."
          />
        ) : (
          <div className="space-y-4">
            <p className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm leading-relaxed">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {settings.legal.billingDisclaimer}
            </p>
            <p className="text-xs text-muted-foreground">
              Editing this needs the settings permission.
            </p>
          </div>
        )}
      </AdminPanel>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Settled, last 10"
          value={settled.length}
          detail="of the most recent transactions"
        />
        <StatTile
          label="Value"
          value={`$${(revenue / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
          detail="Simulated — no card is charged"
          tone="credit"
        />
        <StatTile
          label="Declined"
          value={transactions.filter((row) => row.status === 'failed').length}
          detail="in the same window"
          tone={transactions.some((row) => row.status === 'failed') ? 'warn' : 'default'}
        />
      </div>

      <AdminPanel
        title="Recent transactions"
        description="The simulated gateway records a row for every attempt, settled or declined, exactly as a real one would."
      >
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has been through checkout yet.</p>
        ) : (
          <AdminTable
            head={
              <>
                <Th>Description</Th>
                <Th className="w-24">Plan</Th>
                <Th numeric className="w-28">
                  Amount
                </Th>
                <Th className="w-28">Status</Th>
                <Th className="w-32">Card</Th>
                <Th numeric className="w-28">
                  When
                </Th>
              </>
            }
          >
            {transactions.map((row) => (
              <tr key={row.id}>
                <Td className="max-w-[20rem]">
                  <p className="truncate">{row.description}</p>
                  {row.failure_code && (
                    <p className="mt-0.5 font-mono text-xs text-danger">{row.failure_code}</p>
                  )}
                </Td>
                <Td>
                  <Badge variant="outline">{row.plan}</Badge>
                </Td>
                <Td numeric>
                  {(row.amount_pence / 100).toLocaleString('en-GB', {
                    style: 'currency',
                    currency: row.currency.toUpperCase(),
                  })}
                </Td>
                <Td>
                  <Badge
                    variant={
                      row.status === 'succeeded'
                        ? 'success'
                        : row.status === 'refunded'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {row.status}
                  </Badge>
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {row.card_brand ? `${row.card_brand} ····${row.card_last4}` : '—'}
                </Td>
                <Td numeric className="text-xs text-muted-foreground">
                  <RelativeTime value={row.created_at} />
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>
    </>
  )
}
