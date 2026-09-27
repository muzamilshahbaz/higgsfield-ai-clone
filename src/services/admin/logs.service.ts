import 'server-only'

import { cmsAdminClient } from '@/lib/supabase/cms'
import type { AuditLogRow, LogLevel, SystemLogRow } from '@/types/cms'

/**
 * The two log readers.
 *
 * Both tables have RLS enabled with no policies and their grants revoked, so the
 * service role is the only reader — which is why this file is `server-only` and
 * why every caller sits behind `requireCapability('logs:read')`.
 *
 * Neither reader paginates by offset past a few pages. `range()` on a large offset
 * makes Postgres walk the rows it is skipping, and a log viewer's realistic use is
 * "the last few hundred, filtered" rather than page 400. The filters are the
 * pagination.
 */

export interface SystemLogQuery {
  level?: LogLevel
  source?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listSystemLogs(
  query: SystemLogQuery = {},
): Promise<{ logs: SystemLogRow[]; total: number }> {
  const { level, source, search, limit = 60, offset = 0 } = query

  let builder = cmsAdminClient().from('system_logs').select('*', { count: 'exact' })

  if (level) builder = builder.eq('level', level)
  if (source) builder = builder.eq('source', source)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`event.ilike.${pattern},message.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[logs.service] system logs failed:', error.message)
    return { logs: [], total: 0 }
  }

  return { logs: data ?? [], total: count ?? 0 }
}

/** Distinct sources, for the filter bar. */
export async function listLogSources(): Promise<string[]> {
  const { data, error } = await cmsAdminClient()
    .from('system_logs')
    .select('source')
    // Bounded: this populates a dropdown, and the set of sources is small and
    // stable. Reading the whole table to build it would be the expensive way to
    // learn six strings.
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.error('[logs.service] sources failed:', error.message)
    return []
  }

  return [...new Set((data ?? []).map((row) => row.source))].sort()
}

export interface AuditQuery {
  entity?: string
  action?: string
  actorId?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listAuditLog(
  query: AuditQuery = {},
): Promise<{ entries: AuditLogRow[]; total: number }> {
  const { entity, action, actorId, search, limit = 60, offset = 0 } = query

  let builder = cmsAdminClient().from('audit_log').select('*', { count: 'exact' })

  if (entity) builder = builder.eq('entity', entity)
  if (action) builder = builder.eq('action', action)
  if (actorId) builder = builder.eq('actor_id', actorId)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    builder = builder.or(`summary.ilike.${pattern},actor_email.ilike.${pattern}`)
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[logs.service] audit failed:', error.message)
    return { entries: [], total: 0 }
  }

  return { entries: data ?? [], total: count ?? 0 }
}

/** The entities and actions present, for the filter bar. */
export async function listAuditFacets(): Promise<{ entities: string[]; actions: string[] }> {
  const { data, error } = await cmsAdminClient()
    .from('audit_log')
    .select('entity, action')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.error('[logs.service] audit facets failed:', error.message)
    return { entities: [], actions: [] }
  }

  return {
    entities: [...new Set((data ?? []).map((row) => row.entity))].sort(),
    actions: [...new Set((data ?? []).map((row) => row.action))].sort(),
  }
}
