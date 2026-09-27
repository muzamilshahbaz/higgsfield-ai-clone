import 'server-only'

import { headers } from 'next/headers'

import type { AdminActor } from '@/lib/admin/guard'
import { cmsAdminClient } from '@/lib/supabase/cms'
import type { LogLevel } from '@/types/cms'
import type { Json } from '@/types/database'

/**
 * The audit trail, and the application event log.
 *
 * Two tables because they answer two questions. `audit_log` answers "who
 * changed this" and is written from admin actions only; `system_logs` answers
 * "what happened" and is written from anywhere. Mixing them makes both harder to
 * read and gives them the same retention, which is wrong for at least one of
 * them.
 *
 * Both writers are best-effort and never throw. A failed audit write must not
 * roll back the change it was describing — losing the record of a save is bad,
 * losing the save because the record failed is worse, and the alternative is an
 * admin panel that refuses to work when one table is unhappy.
 */

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Keys whose values never reach a log row.
 *
 * An audit trail that records the key somebody rotated is a second copy of the
 * key, in a table with different access rules from the vault it came out of.
 * This is matched loosely and case-insensitively against the key name, because
 * the cost of redacting one harmless field is a `[redacted]` in a diff and the
 * cost of missing one is a credential in a log.
 */
const SECRET_KEY_PATTERN =
  /(secret|password|token|api[_-]?key|apikey|ciphertext|private|credential|authorization|bearer)/i

const REDACTED = '[redacted]'

/**
 * A value safe to store in `before`/`after`.
 *
 * Recursive, because a settings payload is an object and a provider form posts
 * a nested one. Depth-limited so a self-referential structure cannot spin here;
 * three levels is deeper than any diff this panel produces.
 */
export function redact(value: unknown, depth = 0): Json {
  if (value === null || value === undefined) return null
  if (depth > 3) return '[truncated]'

  if (typeof value === 'string') {
    // A long string in a diff is almost always body copy, and the whole of it is
    // not what makes the row useful. Enough to recognise the change is enough.
    return value.length > 500 ? `${value.slice(0, 500)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redact(entry, depth + 1))
  }

  if (typeof value === 'object') {
    const out: Record<string, Json> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(entry, depth + 1)
    }
    return out
  }

  // A function, a symbol or a bigint has no business in a diff.
  return null
}

/**
 * The changed fields only, not two whole rows.
 *
 * A diff of every column on every save makes the audit table large and the
 * interesting change hard to find. Comparing serialised values rather than
 * references is what makes `tags: ['a']` → `tags: ['a']` register as no change.
 */
export function diffOf(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Json; after: Json } {
  if (!before) return { before: null, after: redact(after ?? null) }
  if (!after) return { before: redact(before), after: null }

  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key]
    const b = after[key]
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue
    changedBefore[key] = a
    changedAfter[key] = b
  }

  return { before: redact(changedBefore), after: redact(changedAfter) }
}

// ---------------------------------------------------------------------------
// Request provenance
// ---------------------------------------------------------------------------

/**
 * The caller's address and agent, as far as they can be known.
 *
 * `x-forwarded-for` is the first hop's claim and is trivially spoofed by a
 * client talking directly to the app — but behind Vercel (and any sane proxy) it
 * is rewritten, and for an audit trail an approximate address is worth more than
 * none. Only the first entry is kept: the rest of that header is the proxy chain.
 */
async function provenance(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const list = await headers()
    const forwarded = list.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || list.get('x-real-ip') || null
    return { ip, userAgent: list.get('user-agent')?.slice(0, 400) ?? null }
  } catch {
    // Outside a request — a script, or a background task. Not an error.
    return { ip: null, userAgent: null }
  }
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

export interface AuditEntry {
  actor: AdminActor
  /** `create`, `update`, `delete`, `publish`, `rotate`, `suspend`, … */
  action: string
  /** The table or domain object: `plans`, `faq_entries`, `user`, `provider_key`. */
  entity: string
  entityId?: string | null
  /** One line, in an operator's words, for the list view. */
  summary: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

/**
 * Records an admin mutation. Best effort; never throws.
 *
 * The actor's email and role are denormalised into the row because the point of
 * an audit entry is that it still makes sense after the account that wrote it
 * has been deleted — and `actor_id` is `on delete set null` precisely so the row
 * survives that.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const { ip, userAgent } = await provenance()
    const { before, after } = diffOf(entry.before, entry.after)

    const { error } = await cmsAdminClient()
      .from('audit_log')
      .insert({
        actor_id: entry.actor.id,
        actor_email: entry.actor.email,
        actor_role: entry.actor.role,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId ?? null,
        summary: entry.summary.slice(0, 500),
        before,
        after,
        ip,
        user_agent: userAgent,
      })

    if (error) console.error('[audit] write failed:', error.message)
  } catch (cause) {
    console.error('[audit] write threw:', cause)
  }
}

export interface SystemLogEntry {
  level?: LogLevel
  /** Where it came from: `auth`, `generation`, `provider`, `cron`, `admin`. */
  source: string
  /** A stable dotted name, so the list can be filtered: `auth.sign_in`. */
  event: string
  message?: string
  context?: Record<string, unknown> | null
  userId?: string | null
}

/**
 * Records an application event. Best effort; never throws.
 *
 * `context` goes through the same redaction as an audit diff. A provider error
 * message is the most likely thing in this app to carry a key fragment, and the
 * log is the last place it should be reconstructable from.
 */
export async function logEvent(entry: SystemLogEntry): Promise<void> {
  try {
    const { error } = await cmsAdminClient()
      .from('system_logs')
      .insert({
        level: entry.level ?? 'info',
        source: entry.source,
        event: entry.event,
        message: (entry.message ?? '').slice(0, 2000),
        context: entry.context ? redact(entry.context) : null,
        user_id: entry.userId ?? null,
      })

    if (error) console.error('[logEvent] write failed:', error.message)
  } catch (cause) {
    console.error('[logEvent] write threw:', cause)
  }
}
