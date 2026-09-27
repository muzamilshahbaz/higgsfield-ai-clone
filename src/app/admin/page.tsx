import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Compass,
  CreditCard,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Users,
  Wand2,
  Zap,
} from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { navFor } from '@/lib/admin/nav'
import { navIcon } from '@/lib/admin/nav-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { STATUS_LABELS } from '@/lib/constants'
import {
  getOverview,
  getRecentGenerations,
  getRecentUsers,
} from '@/services/admin/analytics.service'
import { listAuditLog } from '@/services/admin/logs.service'

/**
 * The dashboard.
 *
 * `requireStaff` rather than `requireCapability`: this is where the guard redirects
 * somebody who lacks a capability, so it must never be the page that is missing. What
 * it shows is filtered by role instead — the panels below are each gated on the
 * capability that would let an operator act on what they are looking at, so an editor
 * sees content counts and not a list of accounts.
 *
 * The numbers come from one `admin_overview()` call rather than twenty-one counts. The
 * difference on the page an operator opens first is one round trip against twenty-one.
 */
export default async function AdminDashboardPage() {
  const actor = await requireStaff('/admin')

  const canSeeUsers = can(actor.role, 'users:read')
  const canSeeLogs = can(actor.role, 'logs:read')

  const [overview, recentUsers, recentGenerations, audit] = await Promise.all([
    getOverview(),
    canSeeUsers ? getRecentUsers(6) : Promise.resolve([]),
    can(actor.role, 'moderation:read') ? getRecentGenerations(8) : Promise.resolve([]),
    canSeeLogs ? listAuditLog({ limit: 8 }) : Promise.resolve({ entries: [], total: 0 }),
  ])

  const groups = navFor(actor.role)

  return (
    <>
      <AdminPageHeader
        eyebrow="Overview"
        title={`Good to see you, ${actor.displayName ?? actor.handle}`}
        description="Everything the platform is doing right now. The counts are live — nothing on this page is cached between visits."
        actions={
          <Button asChild variant="outline">
            <Link href="/">View the live site</Link>
          </Button>
        }
      />

      {/* ------------------------------------------------------------ headline */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Accounts"
          value={overview.users}
          detail={`${overview.users_new_7d} new this week · ${overview.staff} staff`}
          href={canSeeUsers ? '/admin/users' : undefined}
          icon={Users}
        />
        <StatTile
          label="Generations"
          value={overview.generations}
          detail={`${overview.generations_24h} in the last 24 hours`}
          icon={Zap}
          tone="brand"
        />
        <StatTile
          label="Published"
          value={overview.public_shots}
          detail={`${overview.comments} comments · ${overview.comments_hidden} hidden`}
          href={can(actor.role, 'moderation:read') ? '/admin/explore' : undefined}
          icon={Compass}
        />
        <StatTile
          label="Credits held"
          value={overview.credits_held}
          detail={`${overview.credits_spent_30d.toLocaleString('en-GB')} spent in 30 days`}
          icon={BadgeCheck}
          tone="credit"
        />
      </div>

      {/* --------------------------------------------------- attention needed */}
      {(overview.generations_failed > 0 ||
        overview.errors_24h > 0 ||
        overview.users_suspended > 0 ||
        overview.generations_running > 0) && (
        <AdminPanel
          title="Worth a look"
          description="Only the figures that are not zero appear here, so an empty panel means nothing needs attention."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {overview.generations_running > 0 && (
              <StatTile
                label="In flight"
                value={overview.generations_running}
                detail="queued or rendering right now"
                icon={Activity}
              />
            )}
            {overview.generations_failed > 0 && (
              <StatTile
                label="Failed jobs"
                value={overview.generations_failed}
                detail="each one refunded automatically"
                tone="warn"
                icon={AlertTriangle}
              />
            )}
            {overview.errors_24h > 0 && (
              <StatTile
                label="Errors, 24h"
                value={overview.errors_24h}
                detail="in the system log"
                href={canSeeLogs ? '/admin/logs?level=error' : undefined}
                tone="warn"
                icon={AlertTriangle}
              />
            )}
            {overview.users_suspended > 0 && (
              <StatTile
                label="Not active"
                value={overview.users_suspended}
                detail="suspended or banned"
                href={canSeeUsers ? '/admin/users?status=suspended' : undefined}
                tone="warn"
                icon={Users}
              />
            )}
          </div>
        </AdminPanel>
      )}

      {/* ------------------------------------------------------------ content */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Projects" value={overview.projects} icon={FolderOpen} href={can(actor.role, 'moderation:read') ? '/admin/projects' : undefined} />
        <StatTile label="Assets" value={overview.assets} icon={Layers} href={can(actor.role, 'moderation:read') ? '/admin/assets' : undefined} />
        <StatTile label="Presets" value={overview.presets} icon={Wand2} href={can(actor.role, 'content:write') ? '/admin/presets' : undefined} />
        <StatTile label="Media" value={overview.media} icon={ImageIcon} href={can(actor.role, 'media:read') ? '/admin/media' : undefined} />
      </div>

      {can(actor.role, 'billing:read') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile
            label="Paid subscriptions"
            value={overview.subscriptions_paid}
            detail="active, trialing or past due"
            href="/admin/plans"
            icon={CreditCard}
          />
          <StatTile
            label="Simulated revenue, 30d"
            value={`$${(overview.revenue_minor_30d / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
            detail="Checkout is simulated — no card is ever charged"
            icon={CreditCard}
          />
        </div>
      )}

      {/* ------------------------------------------------------------ activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {can(actor.role, 'moderation:read') && (
          <AdminPanel
            title="Latest generations"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/explore">All shots</Link>
              </Button>
            }
          >
            {recentGenerations.length === 0 ? (
              <AdminEmpty title="Nothing has been generated yet." />
            ) : (
              <AdminTable
                head={
                  <>
                    <Th>Prompt</Th>
                    <Th>Model</Th>
                    <Th>Status</Th>
                    <Th numeric>When</Th>
                  </>
                }
              >
                {recentGenerations.map((row) => (
                  <tr key={row.id}>
                    <Td className="max-w-[18rem]">
                      <p className="truncate">{row.prompt || '—'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        @{row.author_handle ?? 'unknown'}
                      </p>
                    </Td>
                    <Td className="font-mono text-xs text-muted-foreground">{row.model_id}</Td>
                    <Td>
                      <Badge
                        variant={
                          row.status === 'failed'
                            ? 'destructive'
                            : row.status === 'succeeded'
                              ? 'outline'
                              : 'secondary'
                        }
                      >
                        {STATUS_LABELS[row.status]}
                      </Badge>
                    </Td>
                    <Td numeric className="text-xs text-muted-foreground">
                      <RelativeTime value={row.created_at} />
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminPanel>
        )}

        {canSeeUsers && (
          <AdminPanel
            title="Newest accounts"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/users">All users</Link>
              </Button>
            }
          >
            {recentUsers.length === 0 ? (
              <AdminEmpty title="No accounts yet." />
            ) : (
              <AdminTable
                head={
                  <>
                    <Th>Account</Th>
                    <Th>Role</Th>
                    <Th numeric>Credits</Th>
                    <Th numeric>Joined</Th>
                  </>
                }
              >
                {recentUsers.map((row) => (
                  <tr key={row.id}>
                    <Td className="max-w-[14rem]">
                      <Link
                        href={`/admin/users/${row.id}`}
                        className="truncate font-medium hover:text-brand"
                      >
                        {row.display_name ?? row.handle}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">@{row.handle}</p>
                    </Td>
                    <Td>
                      {row.role === 'user' ? (
                        <span className="text-xs text-muted-foreground">User</span>
                      ) : (
                        <Badge variant="outline">{row.role}</Badge>
                      )}
                    </Td>
                    <Td numeric className="text-credit">
                      {row.credits}
                    </Td>
                    <Td numeric className="text-xs text-muted-foreground">
                      <RelativeTime value={row.created_at} />
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminPanel>
        )}
      </div>

      {canSeeLogs && (
        <AdminPanel
          title="Recent changes"
          description="Every mutation an operator makes is recorded, with what the value was before."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/audit">Full trail</Link>
            </Button>
          }
        >
          {audit.entries.length === 0 ? (
            <AdminEmpty
              title="No changes recorded yet."
              description="The first edit anybody makes in this panel will appear here."
            />
          ) : (
            <ul className="space-y-2.5">
              {audit.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {entry.action}
                  </Badge>
                  <span className="min-w-0 flex-1">{entry.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {entry.actor_email ?? 'unknown'} · <RelativeTime value={entry.created_at} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      )}

      {/* ------------------------------------------------------- quick links */}
      <AdminPanel
        title="Everything you can reach"
        description={`Filtered to your role. You are signed in with ${actor.role.replace('_', ' ')} permissions.`}
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="eyebrow text-muted-foreground">{group.label}</p>
              <ul className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const Icon = navIcon(item.icon)
                  return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-2/60"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-medium">{item.title}</span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </AdminPanel>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Changes made here take effect on the live site immediately. Every one is recorded in the
        audit trail with the value it replaced.
      </p>
    </>
  )
}
