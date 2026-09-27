import Link from 'next/link'
import { AlertTriangle, Gift } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { ToggleAction } from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { getOverview, getRecentLedger } from '@/services/admin/analytics.service'
import { listCreditRules, type CreditRule } from '@/services/cms/credits.service'
import { listPlanRows } from '@/services/cms/plans.service'

import { setCreditRuleEnabled, updateCreditRule } from '../_actions/commerce'

/**
 * Credit rules — where credits come from.
 *
 * The panel is built around which of these are live and which are not, because the
 * difference matters and is not guessable:
 *
 *   `signup_grant`    is live. Migration 0019 has `handle_new_user()` read it inside the
 *                     same transaction that creates the account, so changing the number
 *                     changes what the next signup receives.
 *   `plan_*`          mirror the plan rows and are edited under Plans. They are here so
 *                     the whole picture is on one screen, and they say where to change
 *                     them.
 *   `bonus_grant`     is the default the Users screen offers when granting by hand.
 *   `referral_bonus`  is future-ready. Nothing awards it, because there is no referral
 *                     flow in this build. The row exists so the figure is configured
 *                     before the feature lands rather than hard-coded into it after.
 *
 * Zero is a legitimate value for the signup grant — an operator closing the free tier —
 * and the trigger then creates accounts with no grant and writes no ledger row. That is
 * the correct behaviour rather than an edge case, and the row says so.
 */

const FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'label', label: 'Label', required: true },
  {
    kind: 'number',
    name: 'amount',
    label: 'Credits',
    half: true,
    min: 0,
    unit: 'credits',
    help: 'Whole numbers. Zero is allowed and means “award nothing”.',
  },
  {
    kind: 'textarea',
    name: 'description',
    label: 'Note',
    rows: 2,
    help: 'For whoever reads this screen next.',
  },
  {
    kind: 'boolean',
    name: 'enabled',
    label: 'Enabled',
    help: 'A disabled signup grant falls back to the 200 the trigger defaults to, not to zero.',
  },
]

/** What the platform actually does with each rule, keyed by rule. */
const RULE_NOTES: Record<string, { note: string; live: boolean }> = {
  signup_grant: {
    note: 'Live. Read by the handle_new_user trigger when an account is created.',
    live: true,
  },
  monthly_renewal: {
    note: 'The free tier’s allowance on renewal. Paid tiers use their own plan credits instead.',
    live: false,
  },
  plan_pro: { note: 'Mirrors the Pro plan. Edit it under Plans — that row is the one enforced.', live: false },
  plan_enterprise: {
    note: 'Mirrors the Enterprise plan. Edit it under Plans.',
    live: false,
  },
  bonus_grant: {
    note: 'The amount the credit dialog on a user’s page offers by default.',
    live: true,
  },
  referral_bonus: {
    note: 'Future-ready. There is no referral flow in this build, so nothing awards it.',
    live: false,
  },
}

function initialFor(rule: CreditRule) {
  return {
    label: rule.label,
    amount: rule.amount,
    description: rule.description ?? '',
    enabled: rule.enabled,
  }
}

export default async function AdminCreditsPage() {
  const actor = await requireCapability('billing:read', '/admin/credits')
  const canWrite = can(actor.role, 'billing:write')

  const [rules, plans, overview, ledger] = await Promise.all([
    listCreditRules(),
    listPlanRows(),
    getOverview(),
    getRecentLedger(20),
  ])

  const signup = rules.find((rule) => rule.key === 'signup_grant')
  const effectiveSignup = signup?.enabled ? signup.amount : SIGNUP_CREDIT_GRANT

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Credits"
        description="Where credits come from, and what the platform is currently holding."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Signup grant"
          value={effectiveSignup}
          detail={
            signup?.enabled
              ? 'awarded on every new account'
              : 'rule disabled — the trigger’s 200 default applies'
          }
          tone="credit"
          icon={Gift}
        />
        <StatTile
          label="Credits held"
          value={overview.credits_held}
          detail="across every account"
          tone="credit"
        />
        <StatTile
          label="Spent, 30 days"
          value={overview.credits_spent_30d}
          detail="debits on the ledger"
        />
        <StatTile
          label="Accounts"
          value={overview.users}
          detail={`${overview.users_new_7d} new this week`}
        />
      </div>

      <AdminPanel
        title="Rules"
        description="Each one names what actually reads it, because two of them are live and four are reference."
        footer="The signup grant is read inside the transaction that creates the account, so the page quoting it and the trigger awarding it cannot disagree. A missing or disabled rule falls back to 200 — the value the function shipped with — rather than to zero."
      >
        {rules.length === 0 ? (
          <AdminEmpty
            title="No credit rules."
            description="Applying migration 0017 seeds the six the platform expects."
          />
        ) : (
          <AdminTable
            head={
              <>
                <Th>Rule</Th>
                <Th numeric className="w-28">
                  Credits
                </Th>
                <Th className="w-24">Live</Th>
                <Th className="w-24">Enabled</Th>
                <Th className="w-28" />
              </>
            }
          >
            {rules.map((rule) => {
              const meta = RULE_NOTES[rule.key]
              return (
                <tr key={rule.key}>
                  <Td className="max-w-[28rem]">
                    <p className="font-medium">{rule.label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{rule.key}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {meta?.note ?? rule.description}
                    </p>
                  </Td>

                  <Td numeric className="text-credit">
                    {rule.amount.toLocaleString('en-GB')}
                  </Td>

                  <Td>
                    {meta?.live ? (
                      <Badge variant="success">Read by the app</Badge>
                    ) : (
                      <Badge variant="secondary">Reference</Badge>
                    )}
                  </Td>

                  <Td>
                    {canWrite ? (
                      <ToggleAction
                        checked={rule.enabled}
                        action={setCreditRuleEnabled.bind(null, rule.key)}
                        label={`Enable the ${rule.label} rule`}
                      />
                    ) : (
                      <Badge variant={rule.enabled ? 'success' : 'secondary'}>
                        {rule.enabled ? 'On' : 'Off'}
                      </Badge>
                    )}
                  </Td>

                  <Td>
                    {canWrite && (
                      <div className="flex justify-end">
                        <RecordDialog
                          title={`Edit “${rule.label}”`}
                          description={meta?.note}
                          fields={FIELDS}
                          initial={initialFor(rule)}
                          action={updateCreditRule.bind(null, rule.key)}
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
        )}
      </AdminPanel>

      <AdminPanel
        title="Credits per plan"
        description="Edited under Plans, because the plan row is what the entitlement path reads. Shown here so the whole credit picture is on one screen."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/plans">Open Plans</Link>
          </Button>
        }
      >
        <AdminTable
          head={
            <>
              <Th>Plan</Th>
              <Th numeric className="w-32">
                Credits
              </Th>
              <Th className="w-32">Cadence</Th>
              <Th>Behaviour</Th>
            </>
          }
        >
          {plans.map((plan) => (
            <tr key={plan.id}>
              <Td className="font-medium">{plan.name}</Td>
              <Td numeric className="text-credit">
                {plan.credits.toLocaleString('en-GB')}
              </Td>
              <Td className="text-xs text-muted-foreground">{plan.cadence}</Td>
              <Td className="text-xs text-muted-foreground">
                {plan.id === 'free'
                  ? 'The one-off signup grant.'
                  : 'Reset — not added — on each renewal.'}
              </Td>
            </tr>
          ))}
        </AdminTable>
      </AdminPanel>

      <AdminPanel
        title="Recent ledger entries"
        description="The append-only money trail, across every account. Every credit that moves leaves a row here."
      >
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has moved yet.</p>
        ) : (
          <AdminTable
            head={
              <>
                <Th className="w-32">Reason</Th>
                <Th numeric className="w-24">
                  Delta
                </Th>
                <Th numeric className="w-28">
                  Balance after
                </Th>
                <Th>Note</Th>
                <Th numeric className="w-28">
                  When
                </Th>
              </>
            }
          >
            {ledger.map((row) => (
              <tr key={row.id}>
                <Td>
                  <Badge
                    variant={
                      row.reason === 'generation_refund'
                        ? 'success'
                        : row.reason === 'admin_adjust'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {row.reason.replace('_', ' ')}
                  </Badge>
                </Td>
                <Td numeric className={row.delta > 0 ? 'text-success' : 'text-danger'}>
                  {row.delta > 0 ? '+' : ''}
                  {row.delta}
                </Td>
                <Td numeric className="text-credit">
                  {row.balance_after}
                </Td>
                <Td className="max-w-[20rem] truncate text-xs text-muted-foreground">
                  {row.note ?? '—'}
                </Td>
                <Td numeric className="text-xs text-muted-foreground">
                  <RelativeTime value={row.created_at} />
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>

      {signup && !signup.enabled && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            The signup grant rule is disabled, so the trigger falls back to its built-in{' '}
            {SIGNUP_CREDIT_GRANT}. To award nothing, enable the rule and set the amount to zero —
            disabling it does not mean zero.
          </span>
        </p>
      )}
    </>
  )
}
