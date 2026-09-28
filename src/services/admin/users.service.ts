import 'server-only'

import { audit } from '@/lib/admin/audit'
import type { AdminActor, AdminResult } from '@/lib/admin/guard'
import { canActOnUser, canAssignRole, ROLE_LABELS } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { cmsAdminClient } from '@/lib/supabase/cms'
import type { SystemLogRow } from '@/types/cms'
import type {
  AccountStatus,
  CreditLedgerRow,
  GenerationRow,
  ProfileRow,
  SubscriptionRow,
  UserRole,
} from '@/types/database'

/**
 * User administration.
 *
 * Reads and writes through the service role, because the alternative does not
 * exist: `profiles` is own-row by policy and that policy is not being widened for
 * an admin screen. Every query therefore states its own filter, and every write is
 * audited.
 *
 * Three guard rails, all of them about the ways an admin panel gets somebody
 * locked out or over-promoted:
 *
 *   · Nobody may change their own role or status. An operator demoting themselves
 *     by accident is recoverable only by another operator, and an operator
 *     promoting themselves is the escalation this panel exists to prevent.
 *   · Role changes go through `canAssignRole`, which refuses granting above your
 *     own rank and refuses touching somebody who outranks you. The form offers the
 *     same set, but this is the check that counts.
 *   · The last active super_admin cannot be demoted, suspended or banned. A
 *     product with nobody who can reach the key vault is a product that needs a
 *     database console to fix.
 *
 * Credits move through `admin_adjust_credits` (migration 0016), never through an
 * update to `profiles.credits`. The balance and the ledger row have to move
 * together or the money trail is fiction.
 */

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface UserListQuery {
  search?: string
  role?: UserRole
  status?: AccountStatus
  /** 'newest' | 'credits' | 'handle' */
  sort?: 'newest' | 'credits' | 'handle'
  limit?: number
  offset?: number
}

export interface UserSummary {
  id: string
  email: string | null
  handle: string
  displayName: string | null
  avatarUrl: string | null
  credits: number
  role: UserRole
  status: AccountStatus
  suspendedUntil: string | null
  createdAt: string
}

function toSummary(row: ProfileRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    credits: row.credits,
    role: row.role,
    status: row.status,
    suspendedUntil: row.suspended_until,
    createdAt: row.created_at,
  }
}

export async function listUsers(
  query: UserListQuery = {},
): Promise<{ users: UserSummary[]; total: number }> {
  const { search, role, status, sort = 'newest', limit = 40, offset = 0 } = query

  let builder = createAdminClient().from('profiles').select('*', { count: 'exact' })

  if (role) builder = builder.eq('role', role)
  if (status) builder = builder.eq('status', status)
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    // Handle, display name and email are the three things an operator has in hand
    // when somebody contacts support. Searching all three is what stops a lookup
    // failing because they gave you the address rather than the handle.
    builder = builder.or(
      `handle.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`,
    )
  }

  const ordering: Record<NonNullable<UserListQuery['sort']>, [string, boolean]> = {
    newest: ['created_at', false],
    credits: ['credits', false],
    handle: ['handle', true],
  }
  const [column, ascending] = ordering[sort]

  const { data, error, count } = await builder
    .order(column, { ascending })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[users.service] list failed:', error.message)
    return { users: [], total: 0 }
  }

  return { users: (data ?? []).map(toSummary), total: count ?? 0 }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface UserDetail {
  profile: ProfileRow
  subscription: SubscriptionRow | null
  ledger: CreditLedgerRow[]
  generations: GenerationRow[]
  logins: SystemLogRow[]
  counts: {
    generations: number
    publicGenerations: number
    projects: number
    assets: number
    comments: number
    providerKeys: number
  }
}

/**
 * Everything one user's page shows, in one pass.
 *
 * Eight independent reads run in parallel rather than in sequence: on a support
 * screen somebody is reading while a caller waits, the difference is the sum of
 * the latencies versus the largest one.
 *
 * `head: true` counts return no rows, so the six count queries cost a count each
 * rather than a page of data each.
 */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const admin = createAdminClient()

  const [
    profile,
    subscription,
    ledger,
    generations,
    logins,
    generationCount,
    publicCount,
    projectCount,
    assetCount,
    commentCount,
    keyCount,
  ] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
    admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    admin
      .from('credit_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    cmsAdminClient()
      .from('system_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('source', 'auth')
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null),
    admin
      .from('generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('visibility', 'public')
      .is('deleted_at', null),
    admin
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null),
    admin.from('assets').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    admin
      .from('user_provider_keys')
      // Deliberately not `select('*')`: this is a count, and a count has no
      // business fetching a column named `ciphertext`.
      .select('provider', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  if (profile.error || !profile.data) {
    if (profile.error) console.error('[users.service] detail failed:', profile.error.message)
    return null
  }

  return {
    profile: profile.data,
    subscription: subscription.data ?? null,
    ledger: ledger.data ?? [],
    generations: generations.data ?? [],
    logins: logins.data ?? [],
    counts: {
      generations: generationCount.count ?? 0,
      publicGenerations: publicCount.count ?? 0,
      projects: projectCount.count ?? 0,
      assets: assetCount.count ?? 0,
      comments: commentCount.count ?? 0,
      providerKeys: keyCount.count ?? 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

/**
 * True when this is the last super_admin who can still sign in.
 *
 * Counted rather than inferred, and it counts *active* super admins — a suspended
 * one cannot open the panel, so they do not keep the door open for anybody.
 */
async function isLastActiveSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('role', 'super_admin')
    .eq('status', 'active')

  if (error) {
    console.error('[users.service] super admin count failed:', error.message)
    // Refusing on an unreadable count is the safe direction: the failure mode is
    // "you have to try again", not "the last administrator was removed".
    return true
  }

  const admins = data ?? []
  return admins.length <= 1 && admins.some((row) => row.id === userId)
}

async function loadTarget(userId: string): Promise<ProfileRow | null> {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data ?? null
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function setUserRole(
  userId: string,
  role: UserRole,
  actor: AdminActor,
): Promise<AdminResult<UserSummary>> {
  if (userId === actor.id) {
    return { ok: false, error: 'You cannot change your own role. Ask another administrator.' }
  }

  const target = await loadTarget(userId)
  if (!target) return { ok: false, error: 'That account no longer exists.' }
  if (target.role === role) return { ok: false, error: `They are already ${ROLE_LABELS[role]}.` }

  if (!canAssignRole(actor.role, target.role, role)) {
    return { ok: false, error: 'Your role cannot make that change.' }
  }

  if (target.role === 'super_admin' && role !== 'super_admin' && (await isLastActiveSuperAdmin(userId))) {
    return {
      ok: false,
      error: 'That is the last active super admin. Promote somebody else before demoting them.',
    }
  }

  const { data, error } = await createAdminClient()
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[users.service] role write failed:', error?.message)
    return { ok: false, error: 'Could not change that role.' }
  }

  await audit({
    actor,
    action: 'role_change',
    entity: 'user',
    entityId: userId,
    summary: `${target.handle}: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[role]}`,
    before: { role: target.role },
    after: { role },
  })

  return { ok: true, data: toSummary(data) }
}

export interface StatusChange {
  status: AccountStatus
  reason?: string | null
  /** Only meaningful for 'suspended'. A ban has no end date. */
  until?: string | null
}

/**
 * Suspends, bans or reinstates an account.
 *
 * The enforcement is in lib/supabase/middleware.ts, which sends a non-active
 * account to a notice page. It is deliberately not a policy change: RLS on
 * `profiles` is own-row, and a suspended user must still be able to read their own
 * row — that is exactly what the notice needs in order to say why and until when.
 */
export async function setUserStatus(
  userId: string,
  change: StatusChange,
  actor: AdminActor,
): Promise<AdminResult<UserSummary>> {
  if (userId === actor.id) {
    return { ok: false, error: 'You cannot suspend or ban your own account.' }
  }

  const target = await loadTarget(userId)
  if (!target) return { ok: false, error: 'That account no longer exists.' }

  // An operator cannot act on somebody who outranks them: a moderator who could
  // ban an admin has an escalation path, and an admin who could suspend a super
  // admin could lock out the only person watching them. One rule, one place.
  if (!canActOnUser(actor.role, target.role)) {
    return { ok: false, error: 'You cannot change the status of that account.' }
  }

  if (
    change.status !== 'active' &&
    target.role === 'super_admin' &&
    (await isLastActiveSuperAdmin(userId))
  ) {
    return { ok: false, error: 'That is the last active super admin. They cannot be locked out.' }
  }

  const { data, error } = await createAdminClient()
    .from('profiles')
    .update({
      status: change.status,
      status_reason: change.reason?.trim() || null,
      status_changed_at: new Date().toISOString(),
      status_changed_by: actor.id,
      // Reinstating clears the end date as well as the status, so a later
      // suspension does not inherit a stale one.
      suspended_until: change.status === 'suspended' ? (change.until ?? null) : null,
    })
    .eq('id', userId)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[users.service] status write failed:', error?.message)
    return { ok: false, error: 'Could not change that account status.' }
  }

  await audit({
    actor,
    action: change.status === 'active' ? 'reinstate' : change.status,
    entity: 'user',
    entityId: userId,
    summary: `${target.handle}: ${target.status} → ${change.status}${change.reason ? ` (${change.reason})` : ''}`,
    before: { status: target.status, status_reason: target.status_reason },
    after: { status: change.status, status_reason: change.reason ?? null, suspended_until: data.suspended_until },
  })

  return { ok: true, data: toSummary(data) }
}

/**
 * Grants or claws back credits.
 *
 * Through `admin_adjust_credits`, which locks the profile row, writes the ledger
 * entry and returns the new balance in one transaction. A clawback larger than the
 * balance settles at zero and the ledger records what was actually applied — see
 * the function's own comment in migration 0016.
 */
export async function adjustUserCredits(
  userId: string,
  delta: number,
  note: string | null,
  actor: AdminActor,
): Promise<AdminResult<{ balance: number }>> {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, error: 'Enter a whole number of credits, positive or negative.', field: 'delta' }
  }
  if (Math.abs(delta) > 1_000_000) {
    return { ok: false, error: 'That is more credits than any plan grants. Check the figure.', field: 'delta' }
  }

  const target = await loadTarget(userId)
  if (!target) return { ok: false, error: 'That account no longer exists.' }

  // Credits are money, and moving somebody's money is an action against them.
  // This was the one destructive account path without a rank check: an admin
  // could zero a super admin's balance while being unable to suspend them.
  if (!canActOnUser(actor.role, target.role)) {
    return { ok: false, error: 'You cannot adjust the credits on that account.' }
  }

  const { data, error } = await cmsAdminClient().rpc('admin_adjust_credits', {
    p_user_id: userId,
    p_delta: delta,
    p_note: note?.trim() || `Adjusted by ${actor.handle}`,
  })

  if (error) {
    console.error('[users.service] credit adjust failed:', error.message)
    return { ok: false, error: 'Could not adjust that balance.' }
  }

  const balance = typeof data === 'number' ? data : target.credits

  await audit({
    actor,
    action: 'credit_adjust',
    entity: 'user',
    entityId: userId,
    summary: `${target.handle}: ${delta > 0 ? '+' : ''}${delta} credits → ${balance}`,
    before: { credits: target.credits },
    after: { credits: balance, delta },
  })

  return { ok: true, data: { balance } }
}

/** An operator-only note on the account. Never shown to the user. */
export async function setUserNotes(
  userId: string,
  notes: string,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ notes: notes.trim() || null })
    .eq('id', userId)

  if (error) {
    console.error('[users.service] notes write failed:', error.message)
    return { ok: false, error: 'Could not save that note.' }
  }

  await audit({
    actor,
    action: 'note',
    entity: 'user',
    entityId: userId,
    summary: 'Updated the operator note',
    // The note itself is deliberately not in the diff. It is free text about a
    // person, and a second copy of it in an append-only table is a copy nobody
    // can later redact.
  })

  return { ok: true, data: null }
}

/**
 * Deletes an account.
 *
 * Through the Auth admin API rather than a delete on `profiles`, because
 * `profiles.id` references `auth.users` and every owned row cascades from there —
 * projects, generations, assets, ledger entries, provider keys. Deleting the
 * profile row alone would leave an auth user who can still sign in and would be
 * handed a fresh profile by `handle_new_user` on the next trigger.
 *
 * The audit row is written first, with the identifying detail, because after this
 * succeeds there is nothing left to read.
 */
export async function deleteUser(
  userId: string,
  actor: AdminActor,
): Promise<AdminResult<null>> {
  if (userId === actor.id) {
    return { ok: false, error: 'You cannot delete your own account from here.' }
  }

  const target = await loadTarget(userId)
  if (!target) return { ok: false, error: 'That account no longer exists.' }

  if (!canActOnUser(actor.role, target.role)) {
    return { ok: false, error: 'You cannot delete that account.' }
  }
  if (target.role === 'super_admin' && (await isLastActiveSuperAdmin(userId))) {
    return { ok: false, error: 'That is the last active super admin.' }
  }

  await audit({
    actor,
    action: 'delete',
    entity: 'user',
    entityId: userId,
    summary: `Deleted ${target.handle} (${target.email ?? 'no email'}) and everything they owned`,
    before: {
      handle: target.handle,
      email: target.email,
      role: target.role,
      credits: target.credits,
      created_at: target.created_at,
    },
  })

  const { error } = await createAdminClient().auth.admin.deleteUser(userId)

  if (error) {
    console.error('[users.service] delete failed:', error.message)
    return { ok: false, error: 'Could not delete that account.' }
  }

  return { ok: true, data: null }
}
