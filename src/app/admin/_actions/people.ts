'use server'

import { revalidatePath } from 'next/cache'

import {
  asInstant,
  asNumber,
  asString,
  type RecordValues,
} from '@/components/admin/form-spec'
import { withCapability, type AdminResult } from '@/lib/admin/guard'
import { ASSIGNABLE_ROLES } from '@/lib/admin/permissions'
import {
  adjustUserCredits,
  deleteUser,
  setUserNotes,
  setUserRole,
  setUserStatus,
} from '@/services/admin/users.service'
import type { AccountStatus, UserRole } from '@/types/database'

/**
 * User administration actions.
 *
 * The capabilities are split deliberately, and the split is the whole point of
 * having roles at all:
 *
 *   `users:write`   — suspend, ban, reinstate, notes. A moderator has this, because
 *                     suspending an account is a moderation outcome.
 *   `users:credits` — moving credits. A moderator does not.
 *   `users:roles`   — appointing staff. Admin and above.
 *
 * Every rule that could be used to escalate privilege — no self-edits, no granting
 * above your own rank, no demoting the last super_admin — is enforced in
 * services/admin/users.service.ts rather than here, so it applies however the
 * service is reached.
 */

function revalidateUser(userId?: string) {
  revalidatePath('/admin/users')
  if (userId) revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin')
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Takes the form's values rather than a bare role string.
 *
 * So the action can be bound to a user id and passed straight to the dialog — a Server
 * Action cannot be partially applied with a closure, and a two-argument
 * `(userId, values)` shape binds cleanly where `(userId, role)` would need one.
 */
export async function changeUserRole(
  userId: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('users:roles', async (actor) => {
    const role = asString(values.role)
    if (!(ASSIGNABLE_ROLES as string[]).includes(role)) {
      return { ok: false, error: 'That is not a role.', field: 'role' }
    }

    const result = await setUserRole(userId, role as UserRole, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateUser(userId)
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATUSES: AccountStatus[] = ['active', 'suspended', 'banned']

/**
 * Suspends, bans or reinstates.
 *
 * `until` is only read for a suspension — a ban has no end date, and accepting one
 * would produce a ban that lifts itself, which is not what the word means.
 */
export async function changeUserStatus(
  userId: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('users:write', async (actor) => {
    const status = asString(values.status)
    if (!(STATUSES as string[]).includes(status)) {
      return { ok: false, error: 'Pick a status.', field: 'status' }
    }

    const reason = asString(values.reason)
    if (status !== 'active' && !reason) {
      return {
        ok: false,
        error: 'Say why. The reason is shown to the account and recorded in the audit trail.',
        field: 'reason',
      }
    }

    const result = await setUserStatus(
      userId,
      {
        status: status as AccountStatus,
        reason,
        until: status === 'suspended' ? asInstant(values.until) : null,
      },
      actor,
    )

    if (!result.ok) return { ok: false, error: result.error }

    revalidateUser(userId)
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

/**
 * Grants or claws back credits.
 *
 * The form posts a signed integer, because "grant 100" and "remove 100" as two
 * buttons is two code paths that can disagree about the ledger sign — and the ledger
 * is the money trail. One signed number, one function, one row.
 */
export async function adjustCredits(
  userId: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('users:credits', async (actor) => {
    const delta = asNumber(values.delta, 0)
    if (delta === 0) {
      return { ok: false, error: 'Enter a positive number to grant or a negative one to remove.', field: 'delta' }
    }

    const result = await adjustUserCredits(userId, delta, asString(values.note) || null, actor)
    if (!result.ok) return { ok: false, error: result.error, field: result.field }

    revalidateUser(userId)
    // The balance is in the studio topbar, so the user's own pages are stale now.
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function saveUserNotes(
  userId: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('users:write', async (actor) => {
    const result = await setUserNotes(userId, asString(values.notes), actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateUser(userId)
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Deletes an account and everything it owns.
 *
 * Behind `users:roles` rather than `users:write`, which is a deliberate escalation:
 * deleting an account is irreversible and cascades through projects, generations,
 * assets and the credit ledger, so it sits with the capability that appoints staff
 * rather than the one that suspends an abuser.
 */
export async function removeUser(userId: string): Promise<AdminResult<null>> {
  return withCapability('users:roles', async (actor) => {
    const result = await deleteUser(userId, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateUser()
    return { ok: true, data: null }
  })
}
