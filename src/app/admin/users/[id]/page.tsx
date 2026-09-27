import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Ban, KeyRound, PauseCircle, ShieldCheck } from 'lucide-react'

import {
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  DetailRow,
  StatTile,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton } from '@/components/admin/controls'
import { toLocalInput, type FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog, RecordForm } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { assignableRoles, can, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/admin/permissions'
import { STATUS_LABELS, TASK_LABELS } from '@/lib/constants'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { creditRuleAmount } from '@/services/cms/credits.service'
import { getUserDetail } from '@/services/admin/users.service'

import {
  adjustCredits,
  changeUserRole,
  changeUserStatus,
  removeUser,
  saveUserNotes,
} from '../../_actions/people'

/**
 * One account.
 *
 * Everything an operator needs in order to answer a support message, and every action
 * that follows from it — in that order, because the actions are at the bottom where they
 * cannot be taken before the context has been read.
 *
 * The capability split is visible on the page rather than hidden. A moderator can suspend
 * this account but cannot move its credits or change its role, so those panels are absent
 * rather than present-and-failing. The role picker only offers roles the operator may
 * actually grant, which is the same rule `canAssignRole` enforces on the server.
 */

function initialsOf(name: string | null, handle: string): string {
  const source = (name ?? handle).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const actor = await requireCapability('users:read', `/admin/users/${id}`)

  const detail = await getUserDetail(id)
  if (!detail) notFound()

  const { profile, subscription, ledger, generations, logins, counts } = detail

  const canStatus = can(actor.role, 'users:write')
  const canCredits = can(actor.role, 'users:credits')
  const canRoles = can(actor.role, 'users:roles')
  const isSelf = actor.id === profile.id

  const bonusDefault = canCredits ? await creditRuleAmount('bonus_grant', 100) : 0
  const roles = assignableRoles(actor.role)

  const ROLE_FIELDS: FieldSpec[] = [
    {
      kind: 'select',
      name: 'role',
      label: 'Role',
      options: roles.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
      help: 'You can only grant a role at or below your own, and cannot change somebody who outranks you.',
    },
  ]

  const STATUS_FIELDS: FieldSpec[] = [
    {
      kind: 'select',
      name: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active — full access' },
        { value: 'suspended', label: 'Suspended — temporary' },
        { value: 'banned', label: 'Banned — permanent' },
      ],
    },
    {
      kind: 'textarea',
      name: 'reason',
      label: 'Reason',
      rows: 2,
      help: 'Shown to the account on the notice page, and recorded in the audit trail. Required for anything other than Active.',
    },
    {
      kind: 'datetime',
      name: 'until',
      label: 'Suspended until',
      help: 'A suspension with an end date lifts itself. Ignored for a ban, which has no end.',
    },
  ]

  const CREDIT_FIELDS: FieldSpec[] = [
    {
      kind: 'number',
      name: 'delta',
      label: 'Credits',
      unit: 'credits',
      help: 'Positive grants, negative removes. A removal larger than the balance settles at zero and the ledger records what was actually applied.',
    },
    {
      kind: 'text',
      name: 'note',
      label: 'Note',
      help: 'Appears on the ledger row the user can see in their own settings.',
    },
  ]

  const NOTES_FIELDS: FieldSpec[] = [
    {
      kind: 'textarea',
      name: 'notes',
      label: 'Operator note',
      rows: 4,
      help: 'Only staff see this. It is not recorded in the audit diff — a note about a person should not become an un-redactable second copy in an append-only table.',
    },
  ]

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-mb-2 self-start">
        <Link href="/admin/users">
          <ArrowLeft className="size-4" aria-hidden />
          All users
        </Link>
      </Button>

      <AdminPageHeader
        eyebrow="Community"
        title={profile.display_name ?? profile.handle}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>@{profile.handle}</span>
            {profile.email && <span>{profile.email}</span>}
            <span>
              joined <RelativeTime value={profile.created_at} />
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
              <AvatarFallback>{initialsOf(profile.display_name, profile.handle)}</AvatarFallback>
            </Avatar>
            {profile.role !== 'user' && (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="size-3" aria-hidden />
                {ROLE_LABELS[profile.role]}
              </Badge>
            )}
            {profile.status === 'suspended' && (
              <Badge variant="warning" className="gap-1">
                <PauseCircle className="size-3" aria-hidden />
                Suspended
              </Badge>
            )}
            {profile.status === 'banned' && (
              <Badge variant="destructive" className="gap-1">
                <Ban className="size-3" aria-hidden />
                Banned
              </Badge>
            )}
          </div>
        }
      />

      {profile.status !== 'active' && (
        <AdminPanel title={profile.status === 'banned' ? 'This account is banned' : 'This account is suspended'}>
          <dl>
            <DetailRow label="Reason">{profile.status_reason ?? '—'}</DetailRow>
            {profile.suspended_until && (
              <DetailRow label="Until">
                <RelativeTime value={profile.suspended_until} />
              </DetailRow>
            )}
            {profile.status_changed_at && (
              <DetailRow label="Changed">
                <RelativeTime value={profile.status_changed_at} />
              </DetailRow>
            )}
          </dl>
        </AdminPanel>
      )}

      {/* --------------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Credits" value={profile.credits} tone="credit" />
        <StatTile
          label="Generations"
          value={counts.generations}
          detail={`${counts.publicGenerations} published`}
        />
        <StatTile label="Projects" value={counts.projects} detail={`${counts.assets} files`} />
        <StatTile
          label="Own provider keys"
          value={counts.providerKeys}
          detail={counts.providerKeys > 0 ? 'generating on their own quota' : 'using the shared keys'}
          icon={KeyRound}
        />
      </div>

      {/* -------------------------------------------------------- subscription */}
      <AdminPanel title="Plan" description="Read from the subscription row the entitlement path uses.">
        <dl>
          <DetailRow label="Plan">
            <Badge variant="outline">{subscription?.plan ?? 'free'}</Badge>
          </DetailRow>
          <DetailRow label="Status">{subscription?.status ?? 'no subscription'}</DetailRow>
          {subscription?.current_period_end && (
            <DetailRow label="Period ends">
              <RelativeTime value={subscription.current_period_end} />
            </DetailRow>
          )}
          {subscription?.cancel_at_period_end && (
            <DetailRow label="Cancelling">
              <Badge variant="warning">at the end of the period</Badge>
            </DetailRow>
          )}
          <DetailRow label="Comments posted">{counts.comments}</DetailRow>
        </dl>
      </AdminPanel>

      {/* ------------------------------------------------------------- actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {canRoles && (
          <AdminPanel
            title="Role"
            description={ROLE_DESCRIPTIONS[profile.role]}
            footer={
              isSelf
                ? 'You cannot change your own role. Ask another administrator.'
                : 'The last active super admin cannot be demoted — promote somebody else first.'
            }
          >
            {isSelf ? (
              <p className="text-sm text-muted-foreground">
                This is your own account, so the role picker is not offered here.
              </p>
            ) : (
              <RecordDialog
                title={`Change ${profile.handle}’s role`}
                description="Takes effect on their next request. They are not signed out."
                fields={ROLE_FIELDS}
                initial={{ role: profile.role }}
                action={changeUserRole.bind(null, profile.id)}
                submitLabel="Change the role"
                successMessage="Role changed."
                trigger={
                  <Button variant="outline">Change role — currently {ROLE_LABELS[profile.role]}</Button>
                }
              />
            )}
          </AdminPanel>
        )}

        {canStatus && (
          <AdminPanel
            title="Access"
            description="Enforced in the middleware. A suspended account can still sign in and read the notice explaining why."
            footer={isSelf ? 'You cannot suspend your own account.' : undefined}
          >
            {isSelf ? (
              <p className="text-sm text-muted-foreground">Not available on your own account.</p>
            ) : (
              <RecordDialog
                title={`Change ${profile.handle}’s access`}
                fields={STATUS_FIELDS}
                initial={{
                  status: profile.status,
                  reason: profile.status_reason ?? '',
                  until: toLocalInput(profile.suspended_until),
                }}
                action={changeUserStatus.bind(null, profile.id)}
                submitLabel="Apply"
                successMessage="Access updated."
                trigger={
                  <Button variant={profile.status === 'active' ? 'outline' : 'default'}>
                    {profile.status === 'active' ? 'Suspend or ban' : 'Reinstate or change'}
                  </Button>
                }
              />
            )}
          </AdminPanel>
        )}

        {canCredits && (
          <AdminPanel
            title="Credits"
            description={`Balance is ${profile.credits.toLocaleString('en-GB')}.`}
            footer="Every adjustment writes a ledger row in the same transaction as the balance change, so the money trail cannot drift."
          >
            <RecordDialog
              title={`Adjust ${profile.handle}’s credits`}
              description="Positive grants, negative removes. The user sees the note on their own ledger."
              fields={CREDIT_FIELDS}
              initial={{ delta: bonusDefault, note: '' }}
              action={adjustCredits.bind(null, profile.id)}
              submitLabel="Apply the adjustment"
              successMessage="Balance updated."
              trigger={<Button variant="outline">Grant or remove credits</Button>}
            />
          </AdminPanel>
        )}

        {canStatus && (
          <AdminPanel title="Operator note" description="Staff only. Never shown to the account.">
            <RecordForm
              fields={NOTES_FIELDS}
              initial={{ notes: profile.notes ?? '' }}
              action={saveUserNotes.bind(null, profile.id)}
              submitLabel="Save the note"
              successMessage="Note saved."
            />
          </AdminPanel>
        )}
      </div>

      {/* --------------------------------------------------------------- history */}
      <AdminPanel title="Credit ledger" description="The 30 most recent entries.">
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has moved on this account.</p>
        ) : (
          <AdminTable
            head={
              <>
                <Th className="w-36">Reason</Th>
                <Th numeric className="w-24">
                  Delta
                </Th>
                <Th numeric className="w-28">
                  Balance
                </Th>
                <Th>Note</Th>
                <Th numeric className="w-28">
                  When
                </Th>
              </>
            }
          >
            {ledger.map((row) => (
              <tr key={row.id}>
                <Td>
                  <Badge
                    variant={
                      row.reason === 'generation_refund'
                        ? 'success'
                        : row.reason === 'admin_adjust'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {row.reason.replace('_', ' ')}
                  </Badge>
                </Td>
                <Td numeric className={row.delta > 0 ? 'text-success' : 'text-danger'}>
                  {row.delta > 0 ? '+' : ''}
                  {row.delta}
                </Td>
                <Td numeric className="text-credit">
                  {row.balance_after}
                </Td>
                <Td className="max-w-[20rem] truncate text-xs text-muted-foreground">
                  {row.note ?? '—'}
                </Td>
                <Td numeric className="text-xs text-muted-foreground">
                  <RelativeTime value={row.created_at} />
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel title="Recent generations" description="The 20 most recent jobs.">
        {generations.length === 0 ? (
          <p className="text-sm text-muted-foreground">They have not generated anything.</p>
        ) : (
          <AdminTable
            head={
              <>
                <Th>Prompt</Th>
                <Th className="w-28">Task</Th>
                <Th className="w-32">Model</Th>
                <Th className="w-28">Status</Th>
                <Th numeric className="w-20">
                  Cost
                </Th>
                <Th numeric className="w-28">
                  When
                </Th>
              </>
            }
          >
            {generations.map((row) => (
              <tr key={row.id}>
                <Td className="max-w-[24rem]">
                  <p className="truncate">{row.prompt || '—'}</p>
                  {row.error_message && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-danger">{row.error_message}</p>
                  )}
                </Td>
                <Td className="text-xs text-muted-foreground">{TASK_LABELS[row.task]}</Td>
                <Td className="font-mono text-[11px] text-muted-foreground">{row.model_id}</Td>
                <Td>
                  <Badge
                    variant={
                      row.status === 'failed'
                        ? 'destructive'
                        : row.status === 'succeeded'
                          ? 'success'
                          : 'secondary'
                    }
                  >
                    {STATUS_LABELS[row.status]}
                  </Badge>
                </Td>
                <Td numeric className="text-credit">
                  {row.credit_cost}
                </Td>
                <Td numeric className="text-xs text-muted-foreground">
                  <RelativeTime value={row.created_at} />
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel
        title="Sign-in history"
        description="Recorded by the auth callback. Only events since this panel was installed appear."
      >
        {logins.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sign-in events recorded for this account yet.
          </p>
        ) : (
          <AdminTable
            head={
              <>
                <Th className="w-40">Event</Th>
                <Th>Detail</Th>
                <Th numeric className="w-32">
                  When
                </Th>
              </>
            }
          >
            {logins.map((row) => (
              <tr key={row.id}>
                <Td>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {row.event}
                  </Badge>
                </Td>
                <Td className="text-xs text-muted-foreground">{row.message || '—'}</Td>
                <Td numeric className="text-xs text-muted-foreground">
                  <RelativeTime value={row.created_at} />
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminPanel>

      {canRoles && !isSelf && (
        <AdminPanel
          title="Delete this account"
          description="Irreversible. Everything they own goes with it: projects, generations, files, their credit ledger and their stored provider keys."
          footer="The audit trail keeps their handle, email, role and balance, because after this there is nothing left to read."
        >
          <DeleteButton
            action={removeUser.bind(null, profile.id)}
            what={`@${profile.handle} and everything they own`}
            label="Delete the account"
            successMessage="Account deleted."
            description={
              <>
                {counts.generations} generation(s), {counts.projects} project(s) and {counts.assets}{' '}
                file(s) will be removed. Suspending is the reversible option and is almost always the
                right one.
              </>
            }
          />
        </AdminPanel>
      )}
    </>
  )
}
