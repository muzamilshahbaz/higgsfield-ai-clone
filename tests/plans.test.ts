import { describe, expect, it } from 'vitest'

import { LIMITS } from '@/lib/constants'
import {
  comparePlans,
  FREE_PLAN,
  getPlan,
  isEntitled,
  isPlanId,
  PLAN_FEATURES,
  PLAN_IDS,
  PLAN_LIST,
  PLANS,
  planFor,
  priceInPence,
} from '@/lib/plans'

/**
 * Entitlement is what a subscription actually buys, so these tests answer one
 * question: for a given plan and status, what limits does the product grant?
 *
 * The failures are asymmetric. Granting a paid tier to someone who has not
 * paid costs money on every render they run; withholding it from someone who
 * has costs a support conversation. Both are covered.
 */

describe('planFor', () => {
  it('grants the named plan while the subscription is paid up', () => {
    expect(planFor('pro', 'active').id).toBe('pro')
    expect(planFor('enterprise', 'active').id).toBe('enterprise')
    expect(planFor('pro', 'trialing').id).toBe('pro')
  })

  it('keeps a past_due subscriber working while the card is retried', () => {
    // Deliberate: locking someone out mid-project while they are still a
    // customer is worse than a few days of grace.
    expect(planFor('enterprise', 'past_due').id).toBe('enterprise')
  })

  it('drops to free once the subscription is cancelled or never completed', () => {
    expect(planFor('enterprise', 'canceled').id).toBe('free')
    expect(planFor('pro', 'incomplete').id).toBe('free')
  })

  it('drops to free when there is no subscription at all', () => {
    expect(planFor(null, null).id).toBe('free')
    expect(planFor(undefined, undefined).id).toBe('free')
  })

  it('never grants a tier from an unrecognised plan or status', () => {
    // A row with a plan this build does not know must not entitle anyone.
    expect(planFor('platinum', 'active').id).toBe('free')
    expect(planFor('enterprise', 'some_future_status').id).toBe('free')
    expect(planFor(42, 'active').id).toBe('free')
  })

  it('treats an entitling status with a missing plan as free, not as the top tier', () => {
    expect(planFor(null, 'active').id).toBe('free')
  })
})

describe('isEntitled', () => {
  it('accepts only the statuses that mean the account is paid up', () => {
    expect(isEntitled('active')).toBe(true)
    expect(isEntitled('trialing')).toBe(true)
    expect(isEntitled('past_due')).toBe(true)
  })

  it('rejects everything else, including empty and unknown values', () => {
    for (const status of ['canceled', 'incomplete', '', 'ACTIVE', null, undefined]) {
      expect(isEntitled(status)).toBe(false)
    }
  })
})

describe('the plan catalogue', () => {
  it('increases every limit as the tier goes up, or the tiers sell nothing', () => {
    const ordered = [...PLAN_LIST].sort((a, b) => a.rank - b.rank)

    for (let i = 1; i < ordered.length; i++) {
      const lower = ordered[i - 1]!
      const higher = ordered[i]!

      expect(higher.credits).toBeGreaterThan(lower.credits)
      expect(higher.maxConcurrentJobs).toBeGreaterThan(lower.maxConcurrentJobs)
      expect(higher.maxGenerationsPerHour).toBeGreaterThan(lower.maxGenerationsPerHour)
      expect(higher.priceGbp).toBeGreaterThan(lower.priceGbp)
    }
  })

  it('keys every plan by its own id and gives each a unique rank', () => {
    for (const [key, plan] of Object.entries(PLANS)) expect(plan.id).toBe(key)
    expect(new Set(PLAN_LIST.map((p) => p.rank)).size).toBe(PLAN_LIST.length)
  })

  it('keeps the free plan identical to the global LIMITS floor', () => {
    // `checkLimits` used to read LIMITS directly. If these drift, a free user's
    // limits change depending on which source a caller consulted.
    expect(FREE_PLAN.maxConcurrentJobs).toBe(LIMITS.maxConcurrentJobs)
    expect(FREE_PLAN.maxGenerationsPerHour).toBe(LIMITS.maxGenerationsPerHour)
    expect(FREE_PLAN.priceGbp).toBe(0)
  })

  it('gives the comparison table a value for every plan on every row', () => {
    // A missing cell renders as an empty box that looks like "not included".
    for (const feature of PLAN_FEATURES) {
      for (const id of PLAN_IDS) {
        expect(feature.values[id], `${feature.label} / ${id}`).toBeDefined()
      }
    }
  })

  it('marks exactly one plan as featured', () => {
    expect(PLAN_LIST.filter((p) => p.featured)).toHaveLength(1)
  })

  it('converts price to whole pence, never a float', () => {
    for (const plan of PLAN_LIST) {
      expect(Number.isInteger(priceInPence(plan))).toBe(true)
      expect(priceInPence(plan)).toBe(plan.priceGbp * 100)
    }
  })
})

describe('isPlanId', () => {
  it('accepts the real ids and rejects everything else', () => {
    for (const id of PLAN_IDS) expect(isPlanId(id)).toBe(true)
    for (const bad of ['studio', 'FREE', '', null, undefined, 1, {}]) {
      expect(isPlanId(bad)).toBe(false)
    }
  })
})

describe('comparePlans', () => {
  it('reads direction from rank, not from price', () => {
    expect(comparePlans('free', 'pro')).toBe('upgrade')
    expect(comparePlans('pro', 'enterprise')).toBe('upgrade')
    expect(comparePlans('enterprise', 'pro')).toBe('downgrade')
    expect(comparePlans('pro', 'free')).toBe('downgrade')
    expect(comparePlans('pro', 'pro')).toBe('same')
  })

  it('agrees with getPlan for every pair', () => {
    for (const from of PLAN_IDS) {
      for (const to of PLAN_IDS) {
        const expected =
          getPlan(to).rank > getPlan(from).rank
            ? 'upgrade'
            : getPlan(to).rank < getPlan(from).rank
              ? 'downgrade'
              : 'same'
        expect(comparePlans(from, to)).toBe(expected)
      }
    }
  })
})
