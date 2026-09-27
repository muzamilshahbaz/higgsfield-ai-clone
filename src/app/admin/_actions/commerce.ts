'use server'

import { revalidatePath } from 'next/cache'

import {
  asBoolean,
  asJson,
  asNullableString,
  asNumber,
  asString,
  asStringArray,
  type RecordValues,
} from '@/components/admin/form-spec'
import { withCapability, type AdminResult } from '@/lib/admin/guard'
import { isPlanId, PLAN_IDS } from '@/lib/plans'
import { cmsCreate, cmsDelete, cmsReorder, cmsToggle, cmsUpdate } from '@/services/cms/crud'

/**
 * Pricing, plans and credit rules.
 *
 * These are the actions closest to money, so two rules are enforced here that the
 * schema cannot:
 *
 *   · **No new tiers.** `subscriptions.plan` is the `plan_tier` Postgres enum, so a
 *     fourth plan could be written to `plans` and could never be assigned to
 *     anybody — it would be a pricing card that fails at checkout. Only the three
 *     ids in `PLAN_IDS` are writable, and there is no create action at all.
 *
 *   · **Limits are real.** `max_concurrent_jobs` and `max_generations_per_hour` are
 *     what `planForUser` hands the generation service, so a zero typed into either
 *     would stop everyone on that tier from generating. The floors below are the
 *     reason the check constraints in migration 0016 exist as well — this is the
 *     one that produces a sentence instead of an error code.
 *
 * `revalidatePath` covers the pricing section, the billing page and the marketing
 * root, because a price appears on all three.
 */

function revalidateCommerce(adminPath: string) {
  revalidatePath(adminPath)
  revalidatePath('/')
  revalidatePath('/settings/billing')
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function updatePlan(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    if (!isPlanId(id)) {
      return {
        ok: false,
        error: `Only the ${PLAN_IDS.join(', ')} tiers exist — a new one needs a migration to the plan_tier enum.`,
      }
    }

    const name = asString(values.name)
    if (!name) return { ok: false, error: 'Give the plan a name.', field: 'name' }

    const price = asNumber(values.price_usd, 0)
    if (price < 0) return { ok: false, error: 'A price cannot be negative.', field: 'price_usd' }
    // Two decimal places, because the column is numeric(10,2) and a third would be
    // rounded away silently on save.
    if (Math.round(price * 100) !== price * 100) {
      return { ok: false, error: 'Use at most two decimal places.', field: 'price_usd' }
    }

    const credits = asNumber(values.credits, 0)
    if (credits < 0) return { ok: false, error: 'Credits cannot be negative.', field: 'credits' }

    const concurrent = asNumber(values.max_concurrent_jobs, 1)
    if (concurrent < 1) {
      return {
        ok: false,
        error: 'At least one job has to be allowed, or nobody on this plan can generate.',
        field: 'max_concurrent_jobs',
      }
    }

    const perHour = asNumber(values.max_generations_per_hour, 1)
    if (perHour < 1) {
      return {
        ok: false,
        error: 'At least one generation an hour, or this plan cannot be used.',
        field: 'max_generations_per_hour',
      }
    }

    const result = await cmsUpdate(
      'plans',
      'id',
      id,
      {
        name,
        tagline: asString(values.tagline),
        price_usd: price,
        cadence: asString(values.cadence, 'per month'),
        billing_period: asString(values.billing_period, 'monthly') as never,
        credits,
        max_concurrent_jobs: concurrent,
        max_generations_per_hour: perHour,
        rank: asNumber(values.rank, 0),
        perks: asStringArray(values.perks),
        cta_label: asNullableString(values.cta_label),
        is_popular: asBoolean(values.is_popular, false),
        is_visible: asBoolean(values.is_visible, true),
        updated_by: actor.id,
      },
      {
        actor,
        entity: 'plan',
        summary: `Edited the ${name} plan — $${price}, ${credits} credits, ${concurrent} concurrent`,
      },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateCommerce('/admin/plans')
    revalidatePath('/admin/pricing')
    return { ok: true, data: null }
  })
}

export async function setPlanVisible(id: string, visible: boolean): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    // Hiding `free` is allowed — an operator closing self-serve signup — but it is
    // worth saying what it does, because the plan is still what an unsubscribed
    // account is entitled to.
    const result = await cmsToggle('plans', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'plan',
      summary: `${visible ? 'Showed' : 'Hid'} the ${id} plan on the pricing page`,
    })
    if (!result.ok) return result
    revalidateCommerce('/admin/plans')
    revalidatePath('/admin/pricing')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Comparison matrix
// ---------------------------------------------------------------------------

/**
 * One row of the comparison table.
 *
 * `values` is a jsonb object keyed by plan id, and the form posts it as JSON text
 * because the alternative — three fields per row that each have to be either a
 * boolean or a string — is a worse form than a small JSON box with an example in
 * the help text.
 */
function parseMatrix(values: RecordValues): { ok: true; data: unknown } | { ok: false; error: string } {
  const parsed = asJson(values.values)
  if (!parsed.ok) return { ok: false, error: 'That is not valid JSON.' }
  const data = parsed.data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      error: 'It has to be an object keyed by plan, like {"free": false, "pro": true}.',
    }
  }
  const unknown = Object.keys(data).filter((key) => !isPlanId(key))
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown plan id: ${unknown.join(', ')}.` }
  }
  return { ok: true, data }
}

export async function createPlanFeature(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const label = asString(values.label)
    if (!label) return { ok: false, error: 'Name the row.', field: 'label' }

    const matrix = parseMatrix(values)
    if (!matrix.ok) return { ok: false, error: matrix.error, field: 'values' }

    const result = await cmsCreate(
      'plan_features',
      {
        label,
        values: matrix.data as never,
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'plan_feature', summary: `Added the comparison row “${label}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateCommerce('/admin/plans')
    return { ok: true, data: null }
  })
}

export async function updatePlanFeature(
  id: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const label = asString(values.label)
    if (!label) return { ok: false, error: 'Name the row.', field: 'label' }

    const matrix = parseMatrix(values)
    if (!matrix.ok) return { ok: false, error: matrix.error, field: 'values' }

    const result = await cmsUpdate(
      'plan_features',
      'id',
      id,
      {
        label,
        values: matrix.data as never,
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'plan_feature', summary: `Edited the comparison row “${label}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateCommerce('/admin/plans')
    return { ok: true, data: null }
  })
}

export async function setPlanFeatureVisible(
  id: string,
  visible: boolean,
): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const result = await cmsToggle('plan_features', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'plan_feature',
      summary: `${visible ? 'Showed' : 'Hid'} a comparison row`,
    })
    if (!result.ok) return result
    revalidateCommerce('/admin/plans')
    return { ok: true, data: null }
  })
}

export async function deletePlanFeature(id: string): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const result = await cmsDelete('plan_features', 'id', id, {
      actor,
      entity: 'plan_feature',
      summary: 'Deleted a comparison row',
    })
    if (!result.ok) return result
    revalidateCommerce('/admin/plans')
    return { ok: true, data: null }
  })
}

export async function reorderPlanFeatures(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const result = await cmsReorder('plan_features', 'id', ids, {
      actor,
      entity: 'plan_feature',
      summary: 'Reordered the comparison rows',
    })
    if (!result.ok) return result
    revalidateCommerce('/admin/plans')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Credit rules
// ---------------------------------------------------------------------------

/**
 * Updates a credit rule.
 *
 * `signup_grant` is the live one: migration 0019 has `handle_new_user()` read it, so
 * changing the amount here changes what the next account is given. The summary says
 * so in as many words, because a credit grant is the kind of change somebody will
 * later want to find in the audit trail.
 *
 * Zero is allowed. An operator closing the free tier sets it to zero, and the
 * trigger then creates the account with no grant and writes no ledger row — which
 * is the correct behaviour, not an edge case to reject.
 */
export async function updateCreditRule(
  key: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const amount = asNumber(values.amount, 0)
    if (amount < 0) return { ok: false, error: 'An amount cannot be negative.', field: 'amount' }
    if (!Number.isInteger(amount)) {
      return { ok: false, error: 'Credits are whole numbers.', field: 'amount' }
    }
    if (amount > 1_000_000) {
      return { ok: false, error: 'That is an implausible grant. Check the figure.', field: 'amount' }
    }

    const enabled = asBoolean(values.enabled, true)

    const result = await cmsUpdate(
      'credit_rules',
      'key',
      key,
      {
        label: asString(values.label, key),
        description: asNullableString(values.description),
        amount,
        enabled,
        updated_by: actor.id,
      },
      {
        actor,
        entity: 'credit_rule',
        summary:
          key === 'signup_grant'
            ? `Signup grant set to ${enabled ? amount : 0} credits${enabled ? '' : ' (rule disabled, so the 200 default applies)'}`
            : `Edited the “${key}” credit rule — ${amount}, ${enabled ? 'enabled' : 'disabled'}`,
      },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateCommerce('/admin/credits')
    return { ok: true, data: null }
  })
}

export async function setCreditRuleEnabled(
  key: string,
  enabled: boolean,
): Promise<AdminResult<null>> {
  return withCapability('billing:write', async (actor) => {
    const result = await cmsToggle('credit_rules', 'key', key, 'enabled', enabled, {
      actor,
      entity: 'credit_rule',
      summary: `${enabled ? 'Enabled' : 'Disabled'} the “${key}” credit rule`,
    })
    if (!result.ok) return result
    revalidateCommerce('/admin/credits')
    return { ok: true, data: null }
  })
}
