import 'server-only'

import { redirect } from 'next/navigation'

import { can, isStaffRole, type Capability } from '@/lib/admin/permissions'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { AccountStatus, UserRole } from '@/types/database'

/**
 * Authorization for the admin panel.
 *
 * Every admin page calls `requireCapability` before it reads anything, and every
 * admin Server Action calls `authorize` before it writes anything. There is no
 * middleware shortcut and no "the layout already checked" — a Server Action is
 * an HTTP endpoint reachable by anyone who can guess its id, and a guard in a
 * layout does not run for it.
 *
 * The role is read through the *user-scoped* client, not the service role. The
 * `profiles_select_own` policy already restricts that read to the caller's own
 * row, so the check cannot be tricked into reading somebody else's role, and no
 * privileged client is involved in deciding whether the caller is privileged.
 */

export interface AdminActor {
  id: string
  email: string | null
  handle: string
  displayName: string | null
  role: UserRole
  status: AccountStatus
}

/**
 * The signed-in staff member, or null.
 *
 * Never throws — a failed read resolves to null, and the callers below turn that
 * into a redirect or a refusal. Returning null on error is the safe direction
 * here: the failure mode is "you are not staff", not "everyone is".
 */
export async function getAdminActor(): Promise<AdminActor | null> {
  const user = await getCurrentUser()
  if (!user) return null

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, handle, display_name, role, status')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) return null

    return {
      id: data.id,
      email: data.email,
      handle: data.handle,
      displayName: data.display_name,
      role: data.role,
      status: data.status,
    }
  } catch {
    return null
  }
}

/**
 * The actor, if they may open the panel at all.
 *
 * A suspended or banned account is refused even when it holds a staff role. The
 * account state is the outer gate: an operator whose access was revoked by
 * suspension should not keep it because their role row still says 'admin'.
 */
export async function getStaffActor(): Promise<AdminActor | null> {
  const actor = await getAdminActor()
  if (!actor) return null
  if (actor.status !== 'active') return null
  if (!isStaffRole(actor.role)) return null
  return actor
}

/**
 * Page guard: the actor, or a redirect.
 *
 * A signed-out visitor goes to sign-in with `next` set, so they land where they
 * were headed. A signed-in non-staff visitor goes to the dashboard rather than
 * to a 403 — telling a stranger that /admin exists and is merely forbidden is
 * more than they need to know.
 */
export async function requireStaff(nextPath = '/admin'): Promise<AdminActor> {
  const actor = await getAdminActor()

  if (!actor) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
  }
  if (actor.status !== 'active' || !isStaffRole(actor.role)) {
    redirect('/dashboard')
  }

  return actor
}

/**
 * Page guard for one capability.
 *
 * Staff who are signed in but lack the capability go to /admin, which they can
 * see — a redirect to a page they are allowed to open is a better answer than an
 * error page, and the nav they land on will not offer the section they tried.
 */
export async function requireCapability(
  capability: Capability,
  nextPath = '/admin',
): Promise<AdminActor> {
  const actor = await requireStaff(nextPath)
  if (!can(actor.role, capability)) {
    redirect('/admin')
  }
  return actor
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * The refusal an action returns.
 *
 * Deliberately the same `{ ok, error }` shape the rest of the app's actions use
 * (see app/(studio)/projects/actions.ts), so an admin form renders a refusal the
 * same way it renders a validation failure — and a thrown redirect never
 * unmounts a dialog someone was typing in.
 */
export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string }

export type Authorized = { ok: true; actor: AdminActor } | { ok: false; error: string }

/**
 * Action guard. Call this first in every admin Server Action.
 *
 * The two refusals say different things on purpose: "sign in again" is
 * actionable, "you do not have permission" is not, and conflating them sends
 * somebody to re-authenticate over a problem authentication will not fix.
 */
export async function authorize(capability: Capability): Promise<Authorized> {
  const actor = await getStaffActor()
  if (!actor) {
    return { ok: false, error: 'Your session has expired or your access was revoked. Sign in again.' }
  }
  if (!can(actor.role, capability)) {
    return { ok: false, error: 'Your role does not have permission to do that.' }
  }
  return { ok: true, actor }
}

/**
 * `authorize`, wrapped around an action body.
 *
 * Saves five lines per action and — more usefully — means an action cannot be
 * written that forgets the check, because the capability is an argument to the
 * thing that runs the body rather than a statement somebody has to remember to
 * put first.
 *
 * Any exception the body throws is caught and reported rather than propagated:
 * these are called from dialogs, and a thrown error would unmount the panel and
 * lose what the operator typed.
 */
export async function withCapability<T>(
  capability: Capability,
  body: (actor: AdminActor) => Promise<AdminResult<T>>,
): Promise<AdminResult<T>> {
  const auth = await authorize(capability)
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    return await body(auth.actor)
  } catch (cause) {
    console.error(`[admin] ${capability} action threw:`, cause)
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Something went wrong. Try again.',
    }
  }
}
