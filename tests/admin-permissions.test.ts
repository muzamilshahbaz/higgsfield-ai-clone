import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ASSIGNABLE_ROLES,
  assignableRoles,
  can,
  canAll,
  canActOnUser,
  canAny,
  canAssignRole,
  hasAuthorityOver,
  isReadCapability,
  isReadOnlyRole,
  isStaffRole,
  postSignInPath,
  READ_CAPABILITIES,
  ROLE_CAPABILITIES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  STAFF_ROLES,
  type Capability,
} from '@/lib/admin/permissions'
import type { UserRole } from '@/types/database'

const ACTIONS_DIR = join(process.cwd(), 'src', 'app', 'admin', '_actions')

/**
 * The permission matrix.
 *
 * Worth testing properly rather than trusting, because every one of these is a rule that exists to
 * stop a specific bad outcome — and a matrix is exactly the kind of thing that gets a row added to
 * it without anybody re-reading the columns.
 *
 * The tests are written as the sentences the rules are supposed to enforce, so a failure names the
 * outcome rather than the data structure.
 */

const ALL_ROLES: UserRole[] = ['user', 'viewer', 'editor', 'moderator', 'admin', 'super_admin']

describe('who can open the panel', () => {
  it('lets no ordinary user in', () => {
    expect(isStaffRole('user')).toBe(false)
    expect(ROLE_CAPABILITIES.user).toHaveLength(0)
  })

  it('lets every staff role in', () => {
    for (const role of STAFF_ROLES) {
      expect(isStaffRole(role)).toBe(true)
    }
  })

  it('treats a missing role as not staff', () => {
    expect(isStaffRole(null)).toBe(false)
    expect(isStaffRole(undefined)).toBe(false)
  })

  it('gives every staff role at least one capability', () => {
    // A role that can open the panel and do nothing in it is a role that produces a blank screen.
    for (const role of STAFF_ROLES) {
      expect(ROLE_CAPABILITIES[role].length).toBeGreaterThan(0)
    }
  })
})

describe('the key vault', () => {
  it('can be changed by an admin and a super admin, and by nobody else', () => {
    for (const role of ALL_ROLES) {
      const expected = role === 'admin' || role === 'super_admin'
      expect(can(role, 'secrets:write')).toBe(expected)
    }
  })

  it('can be read by a read-only admin, because nothing on that screen is revealed', () => {
    // The values are masked from a stored prefix and last four; no display path
    // decrypts anything. Reading the screen answers "is this key still valid"
    // without granting the ability to rotate or remove one.
    expect(can('viewer', 'secrets:read')).toBe(true)
    expect(can('viewer', 'secrets:write')).toBe(false)
  })

  it('stays out of reach of an editor and a moderator', () => {
    expect(canAny('editor', ['secrets:read', 'secrets:write'])).toBe(false)
    expect(canAny('moderator', ['secrets:read', 'secrets:write'])).toBe(false)
  })
})

describe('a read-only admin sees everything and changes nothing', () => {
  it('holds every read capability there is', () => {
    for (const capability of READ_CAPABILITIES) {
      expect(can('viewer', capability)).toBe(true)
    }
  })

  it('holds no capability that is not a read', () => {
    for (const capability of ROLE_CAPABILITIES.viewer) {
      expect(isReadCapability(capability)).toBe(true)
    }
  })

  it('is the only staff role the panel treats as read-only', () => {
    expect(isReadOnlyRole('viewer')).toBe(true)
    for (const role of ['editor', 'moderator', 'admin', 'super_admin'] as UserRole[]) {
      expect(isReadOnlyRole(role)).toBe(false)
    }
  })

  it('can open every screen an admin can open', () => {
    // The rule the nav depends on: every item's visibility is keyed to a read
    // capability, so a read-only admin has a link to each one.
    const adminReads = ROLE_CAPABILITIES.super_admin.filter(isReadCapability)
    expect(canAll('viewer', adminReads)).toBe(true)
  })

  it('cannot move credits, appoint staff or upload', () => {
    expect(canAny('viewer', ['users:credits', 'users:roles', 'media:write'])).toBe(false)
  })

  it('cannot be used to escalate: it may assign no role at all', () => {
    expect(canAssignRole('viewer', 'user', 'viewer')).toBe(false)
    expect(assignableRoles('viewer')).toEqual([])
  })
})

describe('an editor writes the site and nothing else', () => {
  it('can write content and media', () => {
    expect(canAll('editor', ['content:write', 'media:write'])).toBe(true)
  })

  it('cannot read a user, move credits or appoint staff', () => {
    expect(canAny('editor', ['users:read', 'users:credits', 'users:roles'])).toBe(false)
  })

  it('cannot change settings or flags', () => {
    expect(canAny('editor', ['settings:write', 'flags:write'])).toBe(false)
  })
})

describe('a moderator polices the feed', () => {
  it('can moderate and can suspend, because a suspension is a moderation outcome', () => {
    expect(canAll('moderator', ['moderation:write', 'users:write'])).toBe(true)
  })

  it('cannot move credits or appoint staff', () => {
    expect(canAny('moderator', ['users:credits', 'users:roles'])).toBe(false)
  })

  it('cannot edit the site', () => {
    expect(can('moderator', 'content:write')).toBe(false)
  })
})

describe('an admin and a super admin differ by authority, not by capability', () => {
  it('holds every capability a super_admin holds', () => {
    const missing = ROLE_CAPABILITIES.super_admin.filter(
      (capability) => !ROLE_CAPABILITIES.admin.includes(capability),
    )
    expect(missing).toEqual([])
  })

  it('cannot appoint, demote, delete, suspend or bill a super admin', () => {
    // What actually separates the two roles. Each of these is a live refusal in
    // services/admin/users.service.ts.
    expect(canAssignRole('admin', 'super_admin', 'user')).toBe(false)
    expect(canAssignRole('admin', 'user', 'super_admin')).toBe(false)
    expect(canActOnUser('admin', 'super_admin')).toBe(false)
  })

  it('may act on another admin, because two admins administering each other is ordinary', () => {
    expect(canActOnUser('admin', 'admin')).toBe(true)
    expect(canAssignRole('admin', 'admin', 'user')).toBe(true)
  })

  it('lets a super admin act on another super admin, since nothing outranks them', () => {
    expect(canActOnUser('super_admin', 'super_admin')).toBe(true)
  })
})

describe('rank decides who may act on whom', () => {
  it('reaches down and sideways, never up', () => {
    expect(hasAuthorityOver('moderator', 'user')).toBe(true)
    expect(hasAuthorityOver('moderator', 'moderator')).toBe(true)
    expect(hasAuthorityOver('moderator', 'admin')).toBe(false)
    expect(hasAuthorityOver('admin', 'super_admin')).toBe(false)
    expect(hasAuthorityOver('super_admin', 'admin')).toBe(true)
  })

  it('gives a read-only admin authority over nobody but an ordinary user', () => {
    // Rank is authority over people, not breadth of access: a viewer sees more
    // screens than an editor and can act on none of them. It holds no
    // `users:write` either, so this is belt to that braces.
    expect(hasAuthorityOver('viewer', 'editor')).toBe(false)
    expect(canAny('viewer', ['users:write', 'users:roles'])).toBe(false)
  })

  it('answers false for a missing role on either side', () => {
    expect(hasAuthorityOver(null, 'user')).toBe(false)
    expect(hasAuthorityOver('super_admin', null)).toBe(false)
  })
})

describe('where an account lands after signing in', () => {
  it('sends every staff role to the panel', () => {
    for (const role of STAFF_ROLES) {
      expect(postSignInPath(role, 'active')).toBe('/admin')
    }
  })

  it('sends an ordinary user to the studio', () => {
    expect(postSignInPath('user', 'active')).toBe('/dashboard')
  })

  it('sends a suspended or banned operator to the studio, where the notice is', () => {
    expect(postSignInPath('super_admin', 'suspended')).toBe('/dashboard')
    expect(postSignInPath('admin', 'banned')).toBe('/dashboard')
  })

  it('sends an unknown account to the studio', () => {
    expect(postSignInPath(null, null)).toBe('/dashboard')
  })
})

describe('role assignment cannot be used to escalate', () => {
  it('lets nobody grant a role above their own', () => {
    // Only the two roles that hold `users:roles` get a list at all.
    expect(assignableRoles('viewer')).toEqual([])
    expect(assignableRoles('editor')).toEqual([])
    expect(assignableRoles('moderator')).toEqual([])
    expect(assignableRoles('admin')).toEqual([
      'user',
      'viewer',
      'editor',
      'moderator',
      'admin',
    ])
    expect(assignableRoles('super_admin')).toEqual(ASSIGNABLE_ROLES)
  })

  it('refuses an admin promoting somebody to super_admin', () => {
    // The escalation this rule exists for: an admin who can mint a super_admin has promoted
    // themselves by proxy.
    expect(canAssignRole('admin', 'user', 'super_admin')).toBe(false)
  })

  it('refuses an admin demoting a super_admin, even to a role within their own ceiling', () => {
    // The case a "can you grant it" check alone misses. 'user' is well inside an admin's range,
    // but the subject outranks them.
    expect(canAssignRole('admin', 'super_admin', 'user')).toBe(false)
  })

  it('lets a super_admin appoint and demote anybody', () => {
    expect(canAssignRole('super_admin', 'user', 'super_admin')).toBe(true)
    expect(canAssignRole('super_admin', 'super_admin', 'user')).toBe(true)
  })

  it('refuses a role change from anybody without the roles capability', () => {
    expect(canAssignRole('moderator', 'user', 'editor')).toBe(false)
    expect(canAssignRole('editor', 'user', 'user')).toBe(false)
    expect(canAssignRole(null, 'user', 'user')).toBe(false)
  })
})

describe('the matrix is complete', () => {
  it('has an entry for every role in the enum', () => {
    // `Record<UserRole, …>` makes this a compile error too; the test is here so a role added with a
    // cast still fails something.
    for (const role of ALL_ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeDefined()
      expect(ROLE_LABELS[role]).toBeTruthy()
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy()
    }
  })

  it('never lists the same capability twice for one role', () => {
    for (const role of ALL_ROLES) {
      const list = ROLE_CAPABILITIES[role]
      expect(new Set(list).size).toBe(list.length)
    }
  })

  it('pairs every write capability with the read it implies', () => {
    // Being able to change something you cannot see is a screen that cannot render.
    const pairs: [Capability, Capability][] = [
      ['content:write', 'content:read'],
      ['media:write', 'media:read'],
      ['billing:write', 'billing:read'],
      ['users:write', 'users:read'],
      ['users:credits', 'users:read'],
      ['users:roles', 'users:read'],
      ['moderation:write', 'moderation:read'],
      ['providers:write', 'providers:read'],
      ['secrets:write', 'secrets:read'],
      ['settings:write', 'settings:read'],
    ]

    for (const role of ALL_ROLES) {
      for (const [write, read] of pairs) {
        if (can(role, write)) {
          expect(can(role, read), `${role} has ${write} without ${read}`).toBe(true)
        }
      }
    }
  })
})

describe('the backend is what actually refuses a read-only admin', () => {
  /**
   * Reads the guard out of every admin Server Action.
   *
   * The frontend's read-only mode is a courtesy — it stops the panel offering a
   * button that would be refused. This is the refusal itself, and it holds only
   * while two things stay true: every action is behind a capability, and none of
   * those capabilities is one a viewer holds. Both are asserted here against the
   * files themselves rather than trusted, because "somebody adds an action and
   * forgets the wrapper" is exactly the failure this has to catch.
   */
  const actionSource = readdirSync(ACTIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ file, body: readFileSync(join(ACTIONS_DIR, file), 'utf8') }))

  const guards = actionSource.flatMap(({ file, body }) =>
    [...body.matchAll(/withCapability\(\s*'([a-z]+:[a-z]+)'/g)].map((match) => ({
      file,
      capability: match[1] as Capability,
    })),
  )

  it('finds a guard in every action file', () => {
    expect(actionSource.length).toBeGreaterThan(0)
    for (const { file, body } of actionSource) {
      expect(body, `${file} has no withCapability`).toMatch(/withCapability\(/)
    }
  })

  it('never guards a mutation with a read capability', () => {
    for (const { file, capability } of guards) {
      expect(isReadCapability(capability), `${file} guards a write with ${capability}`).toBe(false)
    }
  })

  it('refuses a read-only admin from every one of them', () => {
    expect(guards.length).toBeGreaterThan(50)
    for (const { file, capability } of guards) {
      expect(can('viewer', capability), `${file}: viewer holds ${capability}`).toBe(false)
    }
  })

  it('lets a super admin through every one of them', () => {
    for (const { file, capability } of guards) {
      expect(can('super_admin', capability), `${file}: super_admin lacks ${capability}`).toBe(true)
    }
  })
})

describe('the auth pages do not decide where a sign-in lands', () => {
  /**
   * The regression this exists for.
   *
   * `safeNextPath(next)` defaults to /dashboard. The sign-in page called it on
   * the raw query parameter and passed the result into the form's hidden field,
   * so the field was *never* empty — and the action's own decision about where
   * an account belongs could never win. Every staff sign-in landed in the
   * studio, while the middleware path (already signed in, visiting /sign-in)
   * redirected correctly, which is what made it look fixed.
   *
   * The rule: a page may forward a destination the visitor asked for. It may not
   * invent one.
   */
  const pages = ['sign-in', 'sign-up'].map((name) => ({
    name,
    body: readFileSync(join(process.cwd(), 'src', 'app', '(auth)', name, 'page.tsx'), 'utf8'),
  }))

  it('never falls back to a destination of their own', () => {
    for (const { name, body } of pages) {
      // The assignment form, so the note explaining the bug does not match it.
      expect(body, `${name} manufactures a next`).not.toMatch(/=\s*safeNextPath\(next\)/)
    }
  })

  it('forwards only what the visitor asked for', () => {
    for (const { name, body } of pages) {
      expect(body, `${name} does not guard on an explicit next`).toMatch(
        /next \? safeNextPath\(next, ''\) : ''/,
      )
    }
  })

  it('leaves the OAuth callback free to decide too', () => {
    const body = readFileSync(join(process.cwd(), 'src', 'app', '(auth)', 'actions.ts'), 'utf8')
    // The value is baked into the callback URL, so a default here would reach
    // the callback as an instruction it has to honour.
    expect(body).toMatch(/safeNextPath\(String\(formData\.get\('next'\) \?\? ''\), ''\)/)
  })
})
