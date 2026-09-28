import { isStaffRole } from '@/lib/admin/permissions'
import type { ProfileRow } from '@/types/database'

/**
 * Whether the public header should offer the panel instead of the studio.
 *
 * One function rather than the same two-clause condition written out on the
 * landing page, the Explore feed and a permalink — three places that must agree,
 * because an operator who sees "Admin panel" on one page and "Dashboard" on the
 * next will reasonably assume one of them is broken.
 *
 * Takes the profile those pages have already loaded, so this costs no query. A
 * suspended staff account is not offered the panel: the guard would bounce them
 * to the studio, and a button that bounces is worse than no button.
 *
 * Presentation only. /admin runs `requireStaff` on arrival regardless of which
 * button anybody was shown.
 */
export function isStaffVisitor(profile: Pick<ProfileRow, 'role' | 'status'> | null): boolean {
  if (!profile) return false
  if (profile.status !== 'active') return false
  return isStaffRole(profile.role)
}
