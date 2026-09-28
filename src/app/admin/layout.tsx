import type { Metadata } from 'next'

import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminReadOnlyProvider, ReadOnlyNotice } from '@/components/admin/read-only'
import { requireStaff } from '@/lib/admin/guard'
import { navFor } from '@/lib/admin/nav'
import { isReadOnlyRole, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/admin/permissions'

/**
 * The admin shell.
 *
 * `requireStaff` runs here, which is the outer gate: a signed-out visitor is sent to
 * sign-in with `next` set, and a signed-in non-staff visitor is sent to the dashboard
 * rather than to a 403 — telling a stranger that /admin exists and is merely
 * forbidden is more than they need to know.
 *
 * It is the outer gate and not the only one. Each page calls `requireCapability` for
 * its own section and each action calls `authorize`, because a Server Action is an
 * HTTP endpoint that a layout guard never runs for. This layout decides who sees the
 * chrome; those decide who can do anything.
 *
 * `navFor(role)` filters the sidebar on the server, so the browser is never handed a
 * list of sections it would then have to hide — and a role that cannot reach a
 * section has no link to it in its markup at all.
 *
 * `AdminReadOnlyProvider` carries one boolean down to every control that can change
 * something. It is presentation, not authorization: a read-only role holds no
 * `:write` capability, so every action already refuses it in `authorize()`. The
 * provider is why the panel does not offer buttons that would be refused.
 */
export const metadata: Metadata = {
  title: 'Admin',
  // A staff surface has no business in an index. `robots.ts` covers /admin as well;
  // this is the belt to that braces.
  robots: { index: false, follow: false },
}

/** Two letters for the avatar, from whatever the account actually has. */
function initialsOf(displayName: string | null, handle: string): string {
  const source = (displayName ?? handle).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase() || '??'
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff('/admin')
  const groups = navFor(actor.role)
  const readOnly = isReadOnlyRole(actor.role)

  return (
    <AdminReadOnlyProvider readOnly={readOnly} roleLabel={ROLE_LABELS[actor.role]}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <AdminSidebar
          groups={groups}
          profile={{
            displayName: actor.displayName ?? actor.handle,
            handle: actor.handle,
            email: actor.email,
            initials: initialsOf(actor.displayName, actor.handle),
            roleLabel: ROLE_LABELS[actor.role],
            roleDescription: ROLE_DESCRIPTIONS[actor.role],
          }}
        />

        <div className="min-w-0 flex-1">
          {/* The 1280px cap is deliberate: these are dense tables and forms, and a
              settings panel stretched across a 2560px display is unreadable in a way
              that a landing page is not. */}
          <main className="mx-auto max-w-[80rem] space-y-8 px-4 py-6 sm:px-6 sm:py-8">
            <ReadOnlyNotice />
            {children}
          </main>
        </div>
      </div>
    </AdminReadOnlyProvider>
  )
}
