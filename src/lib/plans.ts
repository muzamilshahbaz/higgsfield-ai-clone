import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'

/**
 * The plan catalogue — the single source of truth for what each tier costs,
 * grants and allows.
 *
 * Everything reads from here: the pricing section, the comparison table, the
 * checkout summary, the billing tab, and the server-side gate in
 * `generation.service`. A plan number that appears in a component is a number
 * that will eventually disagree with the one the server enforces, so none do.
 *
 * Not `server-only` — the marketing and settings UI need it. Nothing secret
 * lives here; it is a price list.
 */

export type PlanId = 'free' | 'pro' | 'enterprise'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /** Whole pounds per month. Free is 0. */
  priceGbp: number
  cadence: string
  /**
   * On `free` this is the one-off signup grant. On a paid plan it is the
   * monthly allowance, reset — not added — on each renewal.
   */
  credits: number
  /** Jobs in flight at once. */
  maxConcurrentJobs: number
  /** Submissions per rolling hour. */
  maxGenerationsPerHour: number
  /**
   * Ordering for upgrade/downgrade decisions. Comparing prices would break
   * the moment a tier is discounted; comparing rank never does.
   */
  rank: number
  /** The short list on the pricing card. */
  perks: string[]
  featured: boolean
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Everything in the studio, on the credits you get at signup.',
    priceGbp: 0,
    cadence: 'forever',
    credits: SIGNUP_CREDIT_GRANT,
    maxConcurrentJobs: 2,
    maxGenerationsPerHour: 20,
    rank: 0,
    perks: [
      `${SIGNUP_CREDIT_GRANT} credits the moment you sign up`,
      'Every model and every preset',
      'Projects, library, history and Explore',
      'Failed jobs refund automatically',
    ],
    featured: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For the week where one idea turns into forty takes.',
    priceGbp: 24,
    cadence: 'per month',
    credits: 2_500,
    maxConcurrentJobs: 5,
    maxGenerationsPerHour: 60,
    rank: 1,
    perks: [
      '2,500 credits every month',
      '5 jobs rendering at once',
      'Bring your own provider keys',
      'Cancel or change plan any time',
    ],
    featured: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Team-scale throughput, with room for a bad week.',
    priceGbp: 79,
    cadence: 'per month',
    credits: 10_000,
    maxConcurrentJobs: 12,
    maxGenerationsPerHour: 240,
    rank: 2,
    perks: [
      '10,000 credits every month',
      '12 jobs rendering at once',
      'Priority placement in the queue',
      'Everything in Pro',
    ],
    featured: false,
  },
}

export const PLAN_IDS: PlanId[] = ['free', 'pro', 'enterprise']
export const PLAN_LIST: Plan[] = PLAN_IDS.map((id) => PLANS[id])

export const FREE_PLAN = PLANS.free

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as string[]).includes(value)
}

export function getPlan(id: PlanId): Plan {
  return PLANS[id]
}

/** Pence, for the transaction record. Money is never stored as a float. */
export function priceInPence(plan: Plan): number {
  return plan.priceGbp * 100
}

// ---------------------------------------------------------------------------
// The comparison table
// ---------------------------------------------------------------------------

/**
 * One row of the feature matrix.
 *
 * Data, not markup, so the comparison table renders whatever the catalogue
 * says and a new plan does not mean editing a component. A `boolean` renders
 * as a tick or a dash; a string renders as itself.
 */
export interface PlanFeature {
  label: string
  values: Record<PlanId, string | boolean>
}

export const PLAN_FEATURES: PlanFeature[] = [
  {
    label: 'Monthly credits',
    values: {
      free: `${PLANS.free.credits} at signup`,
      pro: PLANS.pro.credits.toLocaleString(),
      enterprise: PLANS.enterprise.credits.toLocaleString(),
    },
  },
  {
    label: 'Concurrent renders',
    values: {
      free: String(PLANS.free.maxConcurrentJobs),
      pro: String(PLANS.pro.maxConcurrentJobs),
      enterprise: String(PLANS.enterprise.maxConcurrentJobs),
    },
  },
  {
    label: 'Generations per hour',
    values: {
      free: String(PLANS.free.maxGenerationsPerHour),
      pro: String(PLANS.pro.maxGenerationsPerHour),
      enterprise: String(PLANS.enterprise.maxGenerationsPerHour),
    },
  },
  {
    label: 'Every model and preset',
    values: { free: true, pro: true, enterprise: true },
  },
  {
    label: 'Projects, library and history',
    values: { free: true, pro: true, enterprise: true },
  },
  {
    label: 'Publish and remix on Explore',
    values: { free: true, pro: true, enterprise: true },
  },
  {
    label: 'Bring your own provider keys',
    values: { free: false, pro: true, enterprise: true },
  },
  {
    label: 'Priority queue placement',
    values: { free: false, pro: false, enterprise: true },
  },
]

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

export type SubscriptionStatusLike = string | null | undefined

/**
 * Statuses that mean "this person is entitled to the plan they are on".
 *
 * `past_due` is deliberately included: a retrying card is still a customer,
 * and locking someone out mid-project is a worse outcome than a few days of
 * unpaid access. `canceled` is not — that is where entitlement stops.
 */
const ENTITLED = new Set(['active', 'trialing', 'past_due'])

export function isEntitled(status: SubscriptionStatusLike): boolean {
  return Boolean(status && ENTITLED.has(status))
}

/**
 * The plan to enforce, given what the subscription row says.
 *
 * Both halves matter: a row naming `enterprise` with a `canceled` status is a
 * free user, and a row with no plan at all is a free user. Anything this
 * cannot make sense of resolves to free, because the failure that costs money
 * is granting a tier nobody paid for.
 */
export function planFor(planId: unknown, status: SubscriptionStatusLike): Plan {
  if (!isEntitled(status)) return PLANS.free
  return isPlanId(planId) ? PLANS[planId] : PLANS.free
}

export type PlanChange = 'upgrade' | 'downgrade' | 'same'

export function comparePlans(from: PlanId, to: PlanId): PlanChange {
  const a = PLANS[from].rank
  const b = PLANS[to].rank
  if (b > a) return 'upgrade'
  if (b < a) return 'downgrade'
  return 'same'
}
