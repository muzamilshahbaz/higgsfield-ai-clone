import { describe, expect, it } from 'vitest'

import {
  ASSIGNABLE_ROLES,
  assignableRoles,
  can,
  canAll,
  canAny,
  canAssignRole,
  isStaffRole,
  ROLE_CAPABILITIES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  STAFF_ROLES,
  type Capability,
} from '@/lib/admin/permissions'
import type { UserRole } from '@/types/database'

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

const ALL_ROLES: UserRole[] = ['user', 'editor', 'moderator', 'admin', 'super_admin']

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

describe('the key vault is super_admin only', () => {
  it('grants secrets:read and secrets:write to nobody else', () => {
    for (const role of ALL_ROLES) {
      const expected = role === 'super_admin'
      expect(can(role, 'secrets:read')).toBe(expected)
      expect(can(role, 'secrets:write')).toBe(expected)
    }
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

describe('an admin has everything operational except secrets', () => {
  it('holds every capability a super_admin holds, minus the two secret ones', () => {
    const secrets: Capability[] = ['secrets:read', 'secrets:write']
    const missing = ROLE_CAPABILITIES.super_admin.filter(
      (capability) => !ROLE_CAPABILITIES.admin.includes(capability),
    )
    expect([...missing].sort()).toEqual([...secrets].sort())
  })
})

describe('role assignment cannot be used to escalate', () => {
  it('lets nobody grant a role above their own', () => {
    expect(assignableRoles('editor')).toEqual(['user', 'editor'])
    expect(assignableRoles('moderator')).toEqual(['user', 'editor', 'moderator'])
    expect(assignableRoles('admin')).toEqual(['user', 'editor', 'moderator', 'admin'])
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
