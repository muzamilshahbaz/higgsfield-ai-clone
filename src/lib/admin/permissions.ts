import type { UserRole } from '@/types/database'

/**
 * Role-based permissions for the admin panel.
 *
 * A capability matrix in code rather than rows in a table, deliberately. The
 * grants below are a product decision that changes with the product, they need
 * to be readable in one screen, and — the part a database table cannot give —
 * they are exhaustively type checked: adding a capability without deciding what
 * each role may do with it is a compile error, not a permission that silently
 * defaults to allowed.
 *
 * Not `server-only`: the admin shell needs to know which nav items to render,
 * and that decision is the same one the server enforces. Nothing secret lives
 * here — it is a list of verbs. The authorization that matters happens in
 * lib/admin/guard.ts on the server, on every single action, and a client that
 * lies about its role gets nothing.
 */

/**
 * One capability per area of the panel, in the shape `area:verb`.
 *
 * Read and write are separate everywhere. A moderator who can hide a comment
 * has no business editing the price list, but being able to *see* the price list
 * while investigating a billing complaint is reasonable — so `billing:read` and
 * `billing:write` are different grants.
 */
export type Capability =
  // Content
  | 'content:read'
  | 'content:write'
  | 'media:read'
  | 'media:write'
  // Commerce
  | 'billing:read'
  | 'billing:write'
  // People
  | 'users:read'
  | 'users:write'
  | 'users:credits'
  | 'users:roles'
  // Community
  | 'moderation:read'
  | 'moderation:write'
  // Platform
  | 'providers:read'
  | 'providers:write'
  | 'secrets:read'
  | 'secrets:write'
  | 'settings:read'
  | 'settings:write'
  | 'flags:write'
  // Observability
  | 'logs:read'
  | 'analytics:read'

/** Every role that may open /admin at all. */
export const STAFF_ROLES: UserRole[] = ['editor', 'moderator', 'admin', 'super_admin']

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return Boolean(role && (STAFF_ROLES as string[]).includes(role))
}

/**
 * What each role may do.
 *
 * `Record<UserRole, ...>` rather than a partial map, so a new role in the enum
 * is a compile error here until somebody decides what it can reach. 'user' gets
 * an explicit empty list for the same reason — it is a decision, not an
 * omission.
 *
 * The ladder, in one sentence each:
 *
 *   editor      — writes the site. Copy, media, pricing presentation. Cannot
 *                 see a user's email or touch a credential.
 *   moderator   — polices the feed. Comments, published shots, and the account
 *                 actions that follow from moderating them (suspend, ban).
 *                 Cannot move credits and cannot edit the site.
 *   admin       — everything operational: the two above, plus users, credits,
 *                 providers, settings and flags. Not secrets.
 *   super_admin — admin plus the vendor key vault. The only role that can read
 *                 a masked key, rotate one or run a connection test, because
 *                 that is the one action in the panel that spends money on
 *                 somebody else's account.
 */
export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  user: [],

  editor: [
    'content:read',
    'content:write',
    'media:read',
    'media:write',
    'billing:read',
    'analytics:read',
  ],

  moderator: [
    'content:read',
    'media:read',
    'moderation:read',
    'moderation:write',
    'users:read',
    // Suspending an account is a moderation outcome, so it comes with the badge.
    // Credits and roles deliberately do not.
    'users:write',
    'analytics:read',
    'logs:read',
  ],

  admin: [
    'content:read',
    'content:write',
    'media:read',
    'media:write',
    'billing:read',
    'billing:write',
    'users:read',
    'users:write',
    'users:credits',
    'users:roles',
    'moderation:read',
    'moderation:write',
    'providers:read',
    'providers:write',
    'settings:read',
    'settings:write',
    'flags:write',
    'logs:read',
    'analytics:read',
  ],

  super_admin: [
    'content:read',
    'content:write',
    'media:read',
    'media:write',
    'billing:read',
    'billing:write',
    'users:read',
    'users:write',
    'users:credits',
    'users:roles',
    'moderation:read',
    'moderation:write',
    'providers:read',
    'providers:write',
    'secrets:read',
    'secrets:write',
    'settings:read',
    'settings:write',
    'flags:write',
    'logs:read',
    'analytics:read',
  ],
}

export function can(role: UserRole | null | undefined, capability: Capability): boolean {
  if (!role) return false
  return (ROLE_CAPABILITIES[role] ?? []).includes(capability)
}

/** True when the role holds every one of these. Used by multi-panel screens. */
export function canAll(
  role: UserRole | null | undefined,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.every((capability) => can(role, capability))
}

/** True when the role holds at least one. Used to decide nav visibility. */
export function canAny(
  role: UserRole | null | undefined,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.some((capability) => can(role, capability))
}

/**
 * The roles an operator may assign, given their own.
 *
 * Two rules, and both exist because of how privilege escalation actually
 * happens:
 *
 *   · You cannot grant a role above your own. An admin promoting somebody to
 *     super_admin has promoted themselves by proxy.
 *   · Only a super_admin may mint another super_admin, or demote one. The key
 *     vault is behind that role, and an admin who could demote a super_admin
 *     could remove the only person watching them.
 *
 * The guard enforces this again server-side; this is what the form offers.
 */
const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  editor: 1,
  moderator: 2,
  admin: 3,
  super_admin: 4,
}

export const ASSIGNABLE_ROLES: UserRole[] = ['user', 'editor', 'moderator', 'admin', 'super_admin']

export function assignableRoles(actorRole: UserRole | null | undefined): UserRole[] {
  if (!actorRole) return []
  const ceiling = ROLE_RANK[actorRole] ?? 0
  return ASSIGNABLE_ROLES.filter((role) => ROLE_RANK[role] <= ceiling)
}

/**
 * Whether `actor` may change `subject`'s role to `next`.
 *
 * Also refuses when the subject already outranks the actor, which is the case
 * the "can you grant it" check alone misses: an admin cannot demote a
 * super_admin to 'user' even though 'user' is well within their own ceiling.
 */
export function canAssignRole(
  actorRole: UserRole | null | undefined,
  subjectRole: UserRole,
  next: UserRole,
): boolean {
  if (!actorRole || !can(actorRole, 'users:roles')) return false
  const ceiling = ROLE_RANK[actorRole] ?? 0
  if ((ROLE_RANK[next] ?? 0) > ceiling) return false
  if ((ROLE_RANK[subjectRole] ?? 0) > ceiling) return false
  return true
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
  super_admin: 'Super admin',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  user: 'No access to the admin panel.',
  editor: 'Site content, media and the pricing page. No user data, no credentials.',
  moderator: 'The feed, comments and the account actions that follow from moderating them.',
  admin: 'Everything operational — users, credits, providers, settings and flags.',
  super_admin: 'Admin, plus the provider key vault and the ability to appoint other staff.',
}
