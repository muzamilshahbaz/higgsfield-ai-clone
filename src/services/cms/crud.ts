import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { cmsAdminClient } from '@/lib/supabase/cms'
import type { CmsDatabase } from '@/types/cms'

/**
 * The shared CRUD layer for CMS tables.
 *
 * Twenty screens want the same five operations — list, read one, create, update,
 * delete, reorder — over tables with the same shape conventions (`id`,
 * `sort_order`, `is_visible`). Written per table that is roughly six hundred
 * lines of the same four queries, which is six hundred lines in which one of them
 * forgets to write an audit row.
 *
 * So the audit write is not a courtesy here, it is structural: every mutating
 * function in this file takes an `AdminActor` and a summary and writes the trail
 * itself. A screen physically cannot save a change without one, because there is
 * no code path through this module that skips it.
 *
 * Authorization is NOT here, deliberately. It belongs at the action boundary
 * where the capability is known — `withCapability` in lib/admin/guard.ts — and a
 * check buried in a data helper is a check that is easy to believe in without
 * verifying. Every caller of this file is inside one.
 */

type CmsTables = CmsDatabase['public']['Tables']
export type CmsTableName = keyof CmsTables & string
export type RowOf<T extends CmsTableName> = CmsTables[T]['Row']
export type InsertOf<T extends CmsTableName> = CmsTables[T]['Insert']
export type UpdateOf<T extends CmsTableName> = CmsTables[T]['Update']

/**
 * `as never` on the payload, once, here.
 *
 * supabase-js types `insert`/`update` against the concrete table it was given.
 * When the table name is a generic `T extends CmsTableName`, the builder's
 * payload type collapses to the intersection of every table's Insert shape —
 * which nothing satisfies. `as never` is the documented escape for exactly this,
 * and it is safe because the *public* signatures below are generic over `T`: a
 * caller still gets `InsertOf<'faq_entries'>` checked at the call site, and the
 * looseness never leaves this file.
 */
type AnyPayload = never

/**
 * The same problem for column names and for what comes back.
 *
 * `eq`/`order` type their column against the concrete row, and `select('*')`
 * resolves to a union of every table's row plus PostgREST's error shapes. Under a
 * generic `T` neither narrows, so both are widened here — `asColumn` for the
 * name, `asRow`/`asRows` for the result — and nowhere else. Every one of these is
 * a place where the generic loses information the caller still has: the public
 * signatures stay `RowOf<T>`, so a caller of `cmsList('plans')` is still handed
 * `PlanRow[]`.
 */
function asColumn(column: string) {
  return column as never
}

function asRow<T extends CmsTableName>(data: unknown): RowOf<T> {
  return data as RowOf<T>
}

function asRows<T extends CmsTableName>(data: unknown): RowOf<T>[] {
  return (data ?? []) as RowOf<T>[]
}

export interface ListOptions {
  /** Column to sort on. Defaults to `sort_order`. */
  orderBy?: string
  ascending?: boolean
  /** A secondary sort, for tables where the primary is not unique. */
  thenBy?: string
  limit?: number
}

/**
 * Every row, in the operator's order.
 *
 * Returns `[]` on failure rather than throwing. Every caller is a page that has
 * something else to render, and an empty table reads as "nothing here yet" — a
 * state the admin screens all handle — where an exception is a 500 on a
 * dashboard.
 */
export async function cmsList<T extends CmsTableName>(
  table: T,
  options: ListOptions = {},
): Promise<RowOf<T>[]> {
  const { orderBy = 'sort_order', ascending = true, thenBy, limit } = options

  let query = cmsAdminClient().from(table).select('*').order(asColumn(orderBy), { ascending })
  if (thenBy) query = query.order(asColumn(thenBy), { ascending: true })
  if (limit) query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    console.error(`[cms.crud] list ${table} failed:`, error.message)
    return []
  }
  return asRows<T>(data)
}

/** One row by its key column, or null. */
export async function cmsGet<T extends CmsTableName>(
  table: T,
  keyColumn: string,
  key: string,
): Promise<RowOf<T> | null> {
  const { data, error } = await cmsAdminClient()
    .from(table)
    .select('*')
    .eq(asColumn(keyColumn), key)
    .maybeSingle()

  if (error) {
    console.error(`[cms.crud] get ${table} failed:`, error.message)
    return null
  }
  return data ? asRow<T>(data) : null
}

export interface MutationContext {
  actor: AdminActor
  /** The domain name for the audit row: `faq`, `plan`, `provider`. */
  entity: string
  /** One line for the audit list, in an operator's words. */
  summary: string
}

/**
 * Turns a PostgREST error into something an operator can act on.
 *
 * Three codes are worth naming because all three are things a person did rather
 * than a fault: a duplicate key means the slug is taken, a check violation means
 * a value is out of range, and a foreign-key violation means the thing it points
 * at is gone. Everything else gets a generic message and a server log, because
 * quoting Postgres at somebody filling in a form is not help.
 */
function explain(error: { code?: string; message: string; details?: string | null }): string {
  switch (error.code) {
    // unique_violation
    case '23505':
      return 'Something with that identifier already exists.'
    // check_violation
    case '23514':
      return 'One of those values is outside what this field allows.'
    // foreign_key_violation
    case '23503':
      return 'That refers to something that no longer exists.'
    // not_null_violation
    case '23502':
      return 'A required field is empty.'
    default:
      return 'Could not save that. Check the values and try again.'
  }
}

/** Creates a row and audits it. */
export async function cmsCreate<T extends CmsTableName>(
  table: T,
  values: InsertOf<T>,
  context: MutationContext,
): Promise<AdminResult<RowOf<T>>> {
  const { data, error } = await cmsAdminClient()
    .from(table)
    .insert(values as AnyPayload)
    .select('*')
    .single()

  if (error || !data) {
    console.error(`[cms.crud] create ${table} failed:`, error?.message, error?.details)
    return { ok: false, error: error ? explain(error) : 'Could not create that.' }
  }

  const row = asRow<T>(data)

  await audit({
    actor: context.actor,
    action: 'create',
    entity: context.entity,
    entityId: idOf(row),
    summary: context.summary,
    before: null,
    after: row as Record<string, unknown>,
  })

  return { ok: true, data: row }
}

/**
 * Updates a row and audits the difference.
 *
 * Reads the row first so the audit entry can record what it was. That is one
 * extra query per save, and it is the difference between a trail that says
 * "somebody changed the prompt length" and one that says "somebody changed it
 * from 1200 to 20".
 */
export async function cmsUpdate<T extends CmsTableName>(
  table: T,
  keyColumn: string,
  key: string,
  values: UpdateOf<T>,
  context: MutationContext,
): Promise<AdminResult<RowOf<T>>> {
  const before = await cmsGet(table, keyColumn, key)

  const { data, error } = await cmsAdminClient()
    .from(table)
    .update(values as AnyPayload)
    .eq(asColumn(keyColumn), key)
    .select('*')
    .single()

  if (error || !data) {
    console.error(`[cms.crud] update ${table} failed:`, error?.message, error?.details)
    // A zero-row update with no error is a row that is not there. Saying so is
    // more useful than "could not save", which sends somebody to check their
    // input when the problem is that they are editing something deleted.
    if (!error) return { ok: false, error: 'That item no longer exists. Reload the page.' }
    return { ok: false, error: explain(error) }
  }

  const row = asRow<T>(data)

  await audit({
    actor: context.actor,
    action: 'update',
    entity: context.entity,
    entityId: key,
    summary: context.summary,
    before: (before ?? null) as Record<string, unknown> | null,
    after: row as Record<string, unknown>,
  })

  return { ok: true, data: row }
}

/**
 * Deletes a row and audits what it held.
 *
 * The `before` snapshot is the whole point of auditing a delete: it is the only
 * record that the row existed and what was in it, and it is what makes an
 * accidental deletion recoverable by hand.
 */
export async function cmsDelete<T extends CmsTableName>(
  table: T,
  keyColumn: string,
  key: string,
  context: MutationContext,
): Promise<AdminResult<null>> {
  const before = await cmsGet(table, keyColumn, key)
  if (!before) return { ok: false, error: 'That item no longer exists.' }

  const { error } = await cmsAdminClient().from(table).delete().eq(asColumn(keyColumn), key)

  if (error) {
    console.error(`[cms.crud] delete ${table} failed:`, error.message)
    return { ok: false, error: explain(error) }
  }

  await audit({
    actor: context.actor,
    action: 'delete',
    entity: context.entity,
    entityId: key,
    summary: context.summary,
    before: before as Record<string, unknown>,
    after: null,
  })

  return { ok: true, data: null }
}

/**
 * Rewrites `sort_order` from an ordered list of keys.
 *
 * Spaced by ten so a later insert can be dropped between two rows without
 * renumbering the table, which is the same reason the seed uses 10, 20, 30.
 *
 * Sequential updates rather than an upsert of the whole set: an upsert needs
 * every not-null column of every row, so a reorder would have to round-trip the
 * full rows first and would silently overwrite a concurrent edit to any of their
 * other fields. A handful of one-column updates cannot.
 */
export async function cmsReorder<T extends CmsTableName>(
  table: T,
  keyColumn: string,
  keys: string[],
  context: MutationContext,
): Promise<AdminResult<null>> {
  const client = cmsAdminClient()

  for (const [index, key] of keys.entries()) {
    const { error } = await client
      .from(table)
      .update({ sort_order: (index + 1) * 10 } as AnyPayload)
      .eq(asColumn(keyColumn), key)

    if (error) {
      console.error(`[cms.crud] reorder ${table} failed at ${key}:`, error.message)
      return { ok: false, error: 'Could not save the new order. Reload and try again.' }
    }
  }

  await audit({
    actor: context.actor,
    action: 'reorder',
    entity: context.entity,
    entityId: null,
    summary: context.summary,
    before: null,
    after: { order: keys },
  })

  return { ok: true, data: null }
}

/**
 * Flips a boolean column and audits it.
 *
 * Separate from `cmsUpdate` only because a visibility toggle is the most common
 * mutation in the panel and deserves a summary that names what happened rather
 * than a generic "updated".
 */
export async function cmsToggle<T extends CmsTableName>(
  table: T,
  keyColumn: string,
  key: string,
  column: string,
  value: boolean,
  context: MutationContext,
): Promise<AdminResult<null>> {
  const { error } = await cmsAdminClient()
    .from(table)
    .update({ [column]: value } as AnyPayload)
    .eq(asColumn(keyColumn), key)

  if (error) {
    console.error(`[cms.crud] toggle ${table}.${column} failed:`, error.message)
    return { ok: false, error: explain(error) }
  }

  await audit({
    actor: context.actor,
    action: value ? 'enable' : 'disable',
    entity: context.entity,
    entityId: key,
    summary: context.summary,
    before: { [column]: !value },
    after: { [column]: value },
  })

  return { ok: true, data: null }
}

/** The row's own identifier, for the audit entry. Not every CMS table uses `id`. */
function idOf(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  for (const column of ['id', 'key', 'provider', 'slug']) {
    const value = record[column]
    if (typeof value === 'string') return value
  }
  return null
}
