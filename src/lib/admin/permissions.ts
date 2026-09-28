import type { AccountStatus, UserRole } from '@/types/database'

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
  | 'flags:read'
  | 'flags:write'
  // Observability
  | 'logs:read'
  | 'analytics:read'

/**
 * Every capability that only grants sight of something.
 *
 * Derived by shape rather than listed by hand, so a capability added to the
 * union above lands on the right side of the read/write line automatically. The
 * one that is not `:read` and not a write is `users:credits` — moving somebody's
 * balance — which is emphatically a write.
 */
export const READ_CAPABILITIES: readonly Capability[] = [
  'content:read',
  'media:read',
  'billing:read',
  'users:read',
  'moderation:read',
  'providers:read',
  'secrets:read',
  'settings:read',
  'flags:read',
  'logs:read',
  'analytics:read',
]

export function isReadCapability(capability: Capability): boolean {
  return READ_CAPABILITIES.includes(capability)
}

/** Every role that may open /admin at all. */
export const STAFF_ROLES: UserRole[] = [
  'viewer',
  'editor',
  'moderator',
  'admin',
  'super_admin',
]

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return Boolean(role && (STAFF_ROLES as string[]).includes(role))
}

/**
 * Where an account lands after signing in, absent an explicit destination.
 *
 * Staff go to the panel, because somebody who signs in to moderate a queue
 * should not have to find the panel from the studio first. An explicit `next`
 * still wins — a sign-in prompted by following a link to /create must end at
 * /create, whoever the account belongs to.
 *
 * A suspended or banned staff account goes to the studio, which is where the
 * notice explaining the suspension lives. The panel would only redirect them
 * back out again.
 */
export function postSignInPath(
  role: UserRole | null | undefined,
  status: AccountStatus | null | undefined,
): string {
  if (status && status !== 'active') return '/dashboard'
  return isStaffRole(role) ? '/admin' : '/dashboard'
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
 *   viewer      — reads everything and writes nothing. Not a rung on the way to
 *                 editor: a different axis entirely, which is why it holds
 *                 `users:read` and `secrets:read` that an editor does not, and
 *                 none of the writes an editor has. Support answering "what is
 *                 this account's balance" needs the whole panel and none of the
 *                 buttons.
 *   editor      — writes the site. Copy, media, pricing presentation. Cannot
 *                 see a user's email or touch a credential.
 *   moderator   — polices the feed. Comments, published shots, and the account
 *                 actions that follow from moderating them (suspend, ban).
 *                 Cannot move credits and cannot edit the site.
 *   admin       — everything operational: users, credits, providers, settings,
 *                 flags and the vendor key vault. What separates it from
 *                 super_admin is not a capability but rank: an admin cannot
 *                 promote anybody to super_admin, cannot demote one, and cannot
 *                 delete or suspend one. See ROLE_RANK and `hasAuthorityOver`.
 *   super_admin — admin, plus the authority over other super admins that rank
 *                 denies everyone else.
 */
export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  user: [],

  // Every read in the union, and nothing else. Spelled out rather than spread
  // from READ_CAPABILITIES so that this file still answers "what can a viewer
  // do?" by being read, and so adding a read capability is a deliberate grant
  // here rather than one that arrives by itself.
  viewer: [
    'content:read',
    'media:read',
    'billing:read',
    'users:read',
    'moderation:read',
    'providers:read',
    // The key screen, where every value is already masked and no display path
    // decrypts anything. Reading it is how a viewer answers "is the fal.ai key
    // still valid" without being able to rotate or remove it.
    'secrets:read',
    'settings:read',
    'flags:read',
    'logs:read',
    'analytics:read',
  ],

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
    // The key vault. Previously super_admin only; opened to admin because an
    // admin who can configure every provider but cannot replace a leaked key is
    // an on-call operator who has to wake somebody else up. Authority over
    // *super admins* is what still separates the two roles, and that is rank,
    // not a capability — see `hasAuthorityOver`.
    'secrets:read',
    'secrets:write',
    'settings:read',
    'settings:write',
    'flags:read',
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
    'flags:read',
    'flags:write',
    'logs:read',
    'analytics:read',
  ],
}

/**
 * Whether the role can change anything at all.
 *
 * Drives the "Read only" badge and the disabled state on every shared control.
 * Computed from the matrix rather than compared against `'viewer'`, so a future
 * role that happens to hold no writes gets the same honest interface without
 * anybody remembering to add it to a list.
 */
export function isReadOnlyRole(role: UserRole | null | undefined): boolean {
  if (!role) return true
  const held = ROLE_CAPABILITIES[role] ?? []
  if (held.length === 0) return false // not staff at all; the guard handles them
  return held.every(isReadCapability)
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
  // Below editor on purpose. Rank here is authority over other people, not
  // breadth of access: a viewer sees more screens than an editor and can act on
  // none of them, so it must not be able to outrank anybody.
  viewer: 1,
  editor: 2,
  moderator: 3,
  admin: 4,
  super_admin: 5,
}

/**
 * Whether `actor` has authority over `subject`.
 *
 * The single rule behind every "an admin cannot touch a super admin" refusal:
 * deleting them, suspending them, banning them, changing their role, moving
 * their credits.
 *
 * Equal rank counts, deliberately. Two admins administering each other is
 * ordinary — one leaves, the other closes the account. What must not happen is
 * reaching *upward*, so an admin cannot demote, delete or suspend a super
 * admin, and a super admin can do all three to another because there is no
 * higher rung to appeal to.
 *
 * Self is excluded by the callers, not here: "may I act on myself" is a
 * different question with different answers per action — you may edit your own
 * operator note, you may not delete your own account.
 */
export function hasAuthorityOver(
  actorRole: UserRole | null | undefined,
  subjectRole: UserRole | null | undefined,
): boolean {
  if (!actorRole || !subjectRole) return false
  return (ROLE_RANK[actorRole] ?? 0) >= (ROLE_RANK[subjectRole] ?? 0)
}

export const ASSIGNABLE_ROLES: UserRole[] = [
  'user',
  'viewer',
  'editor',
  'moderator',
  'admin',
  'super_admin',
]

export function assignableRoles(actorRole: UserRole | null | undefined): UserRole[] {
  // Somebody who cannot appoint staff has no list, rather than a list they are
  // not allowed to use. The picker is only rendered behind `users:roles`, so
  // this changes no screen — it stops the function answering a question it was
  // never entitled to answer.
  if (!actorRole || !can(actorRole, 'users:roles')) return []
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
  // An admin cannot demote a super admin even though 'user' is well inside their
  // own ceiling — the subject is what they lack the authority to touch.
  return hasAuthorityOver(actorRole, subjectRole)
}

/**
 * Whether `actor` may take a destructive account action against `subject`.
 *
 * Delete, suspend, ban, adjust credits. Separate from `canAssignRole` because
 * the capability differs per action; this answers only the rank half, which is
 * the same question every time: is this person above me?
 */
export function canActOnUser(
  actorRole: UserRole | null | undefined,
  subjectRole: UserRole,
): boolean {
  return hasAuthorityOver(actorRole, subjectRole)
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  viewer: 'Read-only admin',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
  super_admin: 'Super admin',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  user: 'No access to the admin panel.',
  viewer: 'Opens every screen in the panel and can change nothing. For support, finance and audit.',
  editor: 'Site content, media and the pricing page. No user data, no credentials.',
  moderator: 'The feed, comments and the account actions that follow from moderating them.',
  admin: 'Everything operational — users, credits, providers, settings, flags and the key vault.',
  super_admin: 'Admin, plus authority over other super admins: appointing, demoting and removing them.',
}
