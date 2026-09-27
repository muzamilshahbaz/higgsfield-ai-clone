import Link from 'next/link'
import { Ban, PauseCircle } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  ResultCount,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { FilterChips, Pager, SearchFilter } from '@/components/admin/controls'
import { requireCapability } from '@/lib/admin/guard'
import { ROLE_LABELS } from '@/lib/admin/permissions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { getOverview } from '@/services/admin/analytics.service'
import { listUsers } from '@/services/admin/users.service'
import type { AccountStatus, UserRole } from '@/types/database'

/**
 * The account list.
 *
 * Search covers handle, display name and email, because those are the three things an
 * operator has in hand when somebody contacts support — and a lookup that only matches the
 * handle fails whenever they gave you their address instead.
 *
 * Every filter lives in the URL rather than in component state. That keeps this a Server
 * Component with no account data in the browser bundle, and it means a filtered list is a
 * link somebody can send to a colleague.
 *
 * Nothing on this screen mutates. Every action on an account is on its own page, where the
 * context for the decision is — a suspension made from a table row is a suspension made
 * without looking at what the person actually did.
 */

const PAGE_SIZE = 40

const ROLE_FILTERS: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'Users' },
  { value: 'editor', label: 'Editors' },
  { value: 'moderator', label: 'Moderators' },
  { value: 'admin', label: 'Admins' },
  { value: 'super_admin', label: 'Super admins' },
]

const STATUS_FILTERS: { value: AccountStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
]

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'credits', label: 'Most credits' },
  { value: 'handle', label: 'A–Z' },
]

function initialsOf(name: string | null, handle: string): string {
  const source = (name ?? handle).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; sort?: string; page?: string }>
}) {
  await requireCapability('users:read', '/admin/users')
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [result, overview] = await Promise.all([
    listUsers({
      search: params.q,
      role: params.role as UserRole | undefined,
      status: params.status as AccountStatus | undefined,
      sort: (params.sort as 'newest' | 'credits' | 'handle' | undefined) ?? 'newest',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getOverview(),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Users"
        description="Every account. Open one to change its role, move credits, suspend it or read its history."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Accounts" value={overview.users} detail={`${overview.users_new_7d} this week`} />
        <StatTile label="Active" value={overview.users_active} tone="brand" />
        <StatTile
          label="Suspended or banned"
          value={overview.users_suspended}
          href="/admin/users?status=suspended"
          tone={overview.users_suspended > 0 ? 'warn' : 'default'}
        />
        <StatTile label="Staff" value={overview.staff} detail="can open this panel" />
      </div>

      <AdminPanel
        title="Accounts"
        actions={<SearchFilter placeholder="Handle, name or email" className="w-72" />}
      >
        <div className="space-y-3">
          <FilterChips paramName="status" options={STATUS_FILTERS} allLabel="Any status" />
          <FilterChips paramName="role" options={ROLE_FILTERS} allLabel="Any role" />
          <FilterChips paramName="sort" options={SORTS} allLabel="Newest" />
        </div>

        {result.users.length === 0 ? (
          <AdminEmpty
            title="No accounts match."
            description="Clear the filters and try again."
          />
        ) : (
          <>
            <div className="mt-5">
              <AdminTable
                head={
                  <>
                    <Th>Account</Th>
                    <Th className="w-36">Role</Th>
                    <Th className="w-36">Status</Th>
                    <Th numeric className="w-28">
                      Credits
                    </Th>
                    <Th numeric className="w-28">
                      Joined
                    </Th>
                    <Th className="w-24" />
                  </>
                }
              >
                {result.users.map((user) => (
                  <tr key={user.id}>
                    <Td className="max-w-[24rem]">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 shrink-0">
                          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                          <AvatarFallback>{initialsOf(user.displayName, user.handle)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="block truncate font-medium hover:text-brand"
                          >
                            {user.displayName ?? user.handle}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            @{user.handle}
                            {user.email && ` · ${user.email}`}
                          </p>
                        </div>
                      </div>
                    </Td>

                    <Td>
                      {user.role === 'user' ? (
                        <span className="text-xs text-muted-foreground">User</span>
                      ) : (
                        <Badge variant="default">{ROLE_LABELS[user.role]}</Badge>
                      )}
                    </Td>

                    <Td>
                      {user.status === 'active' ? (
                        <Badge variant="success">Active</Badge>
                      ) : user.status === 'suspended' ? (
                        <div className="space-y-1">
                          <Badge variant="warning" className="gap-1">
                            <PauseCircle className="size-3" aria-hidden />
                            Suspended
                          </Badge>
                          {user.suspendedUntil && (
                            <p className="text-[11px] text-muted-foreground">
                              until <RelativeTime value={user.suspendedUntil} />
                            </p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <Ban className="size-3" aria-hidden />
                          Banned
                        </Badge>
                      )}
                    </Td>

                    <Td numeric className="text-credit">
                      {user.credits.toLocaleString('en-GB')}
                    </Td>

                    <Td numeric className="text-xs text-muted-foreground">
                      <RelativeTime value={user.createdAt} />
                    </Td>

                    <Td>
                      <div className="flex justify-end">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/users/${user.id}`}>Open</Link>
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <ResultCount shown={result.users.length} total={result.total} noun="accounts" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>
    </>
  )
}
