import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `generations` and `assets` each carry two PERMISSIVE select policies —
 * `*_select_own` and `*_select_public` — and Postgres ORs permissive policies
 * together. So a select that leans on RLS alone returns the caller's rows
 * *plus every published row in the database*.
 *
 * That is exactly what happened: a brand new account's dashboard listed two
 * shots belonging to a different user, and counted them in its stat tile,
 * because these reads carried no owner predicate.
 *
 * These tests pin the predicate itself rather than the result, because the
 * bug is invisible until a second user publishes something — a fixture that
 * only ever holds one user's rows passes either way.
 */

const USER = { id: 'user-under-test' }

/** Records every filter a PostgREST chain applies, then resolves like a query. */
function recorder() {
  const calls: Array<[string, unknown]> = []
  const rows: unknown[] = []

  const chain: Record<string, unknown> = {}
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args])
      return chain
    }

  for (const method of ['select', 'eq', 'is', 'in', 'or', 'not', 'order', 'range', 'limit']) {
    chain[method] = record(method)
  }

  // Awaiting the chain resolves it, the way the supabase-js builder does.
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, count: 0, error: null }).then(resolve)

  return {
    calls,
    client: { from: (table: string) => (calls.push(['from', [table]]), chain) },
    /** The columns passed to `.eq()`, in order. */
    eqColumns: () => calls.filter(([m]) => m === 'eq').map(([, args]) => (args as unknown[])[0]),
  }
}

let current: ReturnType<typeof recorder>

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => current.client,
  getCurrentUser: async () => USER,
}))

vi.mock('@/services/asset.service', () => ({
  assetsByGeneration: async () => new Map(),
  attachAssets: async (rows: unknown[]) => rows,
}))

beforeEach(() => {
  current = recorder()
})

describe('owner-scoped reads filter on user_id, not just RLS', () => {
  it('listMyGenerations scopes to the caller', async () => {
    const { listMyGenerations } = await import('@/services/generation.service')
    await listMyGenerations({ limit: 5 })
    expect(current.eqColumns()).toContain('user_id')
  })

  it('listMyGenerations keeps the owner filter alongside every optional filter', async () => {
    const { listMyGenerations } = await import('@/services/generation.service')
    await listMyGenerations({ projectId: 'p1', status: ['succeeded'], task: ['text_to_image'] })
    expect(current.eqColumns()).toContain('user_id')
  })

  it('countMyGenerations scopes to the caller', async () => {
    const { countMyGenerations } = await import('@/services/generation.service')
    await countMyGenerations()
    expect(current.eqColumns()).toContain('user_id')
  })

  it('countMyGenerationsWhere scopes to the caller', async () => {
    const { countMyGenerationsWhere } = await import('@/services/generation.service')
    await countMyGenerationsWhere({ status: ['failed'] })
    expect(current.eqColumns()).toContain('user_id')
  })

  it('every read that reaches the generations table carries an owner predicate', async () => {
    const { listMyGenerations } = await import('@/services/generation.service')
    await listMyGenerations()

    const tables = current.calls.filter(([m]) => m === 'from').map(([, a]) => (a as string[])[0])
    expect(tables).toContain('generations')
    expect(current.eqColumns()).toContain('user_id')
  })
})
