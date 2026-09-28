import Link from 'next/link'
import { Clock } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { DeleteButton, ToggleAction } from '@/components/admin/controls'
import { toLocalInput, type FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { AdminWriteScope } from '@/components/admin/read-only'
import { getFlags } from '@/lib/flags'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { cmsList } from '@/services/cms/crud'
import type { AnnouncementRow } from '@/types/cms'

import {
  createAnnouncement,
  deleteAnnouncement,
  setAnnouncementActive,
  updateAnnouncement,
} from '../_actions/content'

/**
 * Announcements.
 *
 * A window rather than a boolean, which is the whole design. `starts_at` and `ends_at`
 * mean a maintenance notice can be scheduled on Friday for Sunday and expires on its
 * own — instead of living on the site until somebody remembers it, which is how every
 * "scheduled maintenance, 3 March" banner in the world ends up still there in June.
 *
 * Three gates decide whether a banner shows, and the table reflects all three: the
 * `announcements` feature flag is the global off switch, `is_active` is the per-row
 * one, and the window is enforced by the RLS policy as well as by the query — so a
 * forgotten filter cannot resurrect an expired notice.
 */

const VARIANTS = [
  { value: 'info', label: 'Info — neutral' },
  { value: 'brand', label: 'Brand — cyan, for something new' },
  { value: 'success', label: 'Success — green' },
  { value: 'warning', label: 'Warning — amber' },
  { value: 'danger', label: 'Danger — red, for an outage' },
]

const PLACEMENTS = [
  { value: 'global', label: 'Everywhere' },
  { value: 'marketing', label: 'The public site only' },
  { value: 'studio', label: 'The signed-in studio only' },
  { value: 'admin', label: 'This admin panel only' },
]

const FIELDS: FieldSpec[] = [
  { kind: 'text', name: 'title', label: 'Title', required: true, maxLength: 200 },
  {
    kind: 'textarea',
    name: 'body',
    label: 'Body',
    rows: 3,
    help: 'Optional. One or two sentences — a banner is not a blog post.',
  },
  {
    kind: 'select',
    name: 'variant',
    label: 'Tone',
    options: VARIANTS,
    half: true,
    help: 'Red is for something broken. Using it for an announcement teaches people to ignore it.',
  },
  { kind: 'select', name: 'placement', label: 'Where', options: PLACEMENTS, half: true },
  { kind: 'text', name: 'cta_label', label: 'Button label', half: true, placeholder: 'Read more' },
  { kind: 'text', name: 'href', label: 'Button link', half: true, placeholder: '/explore' },
  {
    kind: 'datetime',
    name: 'starts_at',
    label: 'Starts',
    half: true,
    help: 'Leave empty to start immediately. Your local time.',
  },
  {
    kind: 'datetime',
    name: 'ends_at',
    label: 'Ends',
    half: true,
    help: 'Leave empty to run until you turn it off. Your local time.',
  },
  {
    kind: 'boolean',
    name: 'is_dismissible',
    label: 'Dismissible',
    help: 'A dismissed banner stays dismissed for that visitor. Turn this off for an outage notice.',
  },
  { kind: 'boolean', name: 'is_active', label: 'Active' },
]

function initialFor(row: AnnouncementRow) {
  return {
    title: row.title,
    body: row.body ?? '',
    variant: row.variant,
    placement: row.placement,
    cta_label: row.cta_label ?? '',
    href: row.href ?? '',
    starts_at: toLocalInput(row.starts_at),
    ends_at: toLocalInput(row.ends_at),
    is_dismissible: row.is_dismissible,
    is_active: row.is_active,
  }
}

/** Which of the three gates is currently stopping this row, if any. */
function liveState(row: AnnouncementRow, flagOn: boolean) {
  if (!flagOn) return { label: 'Flag off', variant: 'secondary' as const }
  if (!row.is_active) return { label: 'Inactive', variant: 'secondary' as const }

  const now = Date.now()
  if (row.starts_at && new Date(row.starts_at).getTime() > now) {
    return { label: 'Scheduled', variant: 'outline' as const }
  }
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) {
    return { label: 'Expired', variant: 'secondary' as const }
  }
  return { label: 'Live', variant: 'success' as const }
}

export default async function AdminAnnouncementsPage() {
  const actor = await requireCapability('content:read', '/admin/announcements')
  const canWrite = can(actor.role, 'content:write')

  const [rows, flags] = await Promise.all([
    cmsList('announcements', { orderBy: 'created_at', ascending: false }),
    getFlags(),
  ])

  const live = rows.filter((row) => liveState(row, flags.announcements).label === 'Live').length

  return (
    <AdminWriteScope canWrite={canWrite}>
      <AdminPageHeader
        eyebrow="Content"
        title="Announcements"
        description="Scheduled banners. A window means a notice expires on its own rather than living on the site until somebody remembers it."
        actions={
          <RecordDialog
            title="New announcement"
            description="Set a window and it takes care of itself."
            fields={FIELDS}
            initial={{
              variant: 'info',
              placement: 'global',
              is_dismissible: true,
              is_active: true,
            }}
            action={createAnnouncement}
            submitLabel="Schedule it"
            successMessage="Announcement scheduled."
            resetOnSave
            columns={2}
            triggerLabel="New announcement"
          />
        }
      />

      {!flags.announcements && (
        <AdminPanel title="The announcements flag is off">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Nothing in this table is being shown, whatever its own state says. The{' '}
            <code className="font-mono text-xs">announcements</code> feature flag suppresses every
            banner at once — turn it back on under Feature flags.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/admin/flags">Open feature flags</Link>
          </Button>
        </AdminPanel>
      )}

      <AdminPanel
        title={`${rows.length} announcement${rows.length === 1 ? '' : 's'}`}
        description={`${live} live right now.`}
        footer="Three things decide whether a banner appears: the feature flag, the row’s own Active switch, and the window. The State column shows which one is stopping it."
      >
        {rows.length === 0 ? (
          <AdminEmpty
            title="No announcements."
            description="Nothing is being shown to anybody. Create one when you need to say something."
          />
        ) : (
          <AdminTable
            head={
              <>
                <Th>Announcement</Th>
                <Th className="w-32">Where</Th>
                <Th className="w-48">Window</Th>
                <Th className="w-28">State</Th>
                <Th className="w-24">Active</Th>
                <Th className="w-36" />
              </>
            }
          >
            {rows.map((row) => {
              const state = liveState(row, flags.announcements)
              return (
                <tr key={row.id}>
                  <Td className="max-w-[24rem]">
                    <p className="flex items-center gap-2 font-medium">
                      <Badge variant={row.variant === 'danger' ? 'destructive' : row.variant === 'brand' ? 'default' : 'secondary'}>
                        {row.variant}
                      </Badge>
                      {row.title}
                    </p>
                    {row.body && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {row.body}
                      </p>
                    )}
                  </Td>

                  <Td className="text-xs text-muted-foreground">
                    {PLACEMENTS.find((entry) => entry.value === row.placement)?.label ??
                      row.placement}
                  </Td>

                  <Td className="text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3 shrink-0" aria-hidden />
                      {row.starts_at ? <RelativeTime value={row.starts_at} /> : 'immediately'}
                      {' → '}
                      {row.ends_at ? <RelativeTime value={row.ends_at} /> : 'no end'}
                    </span>
                  </Td>

                  <Td>
                    <Badge variant={state.variant}>{state.label}</Badge>
                  </Td>

                  <Td>
                    <ToggleAction
                      checked={row.is_active}
                      action={setAnnouncementActive.bind(null, row.id)}
                      label={`Activate “${row.title}”`}
                    />
                  </Td>

                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <RecordDialog
                        title={`Edit “${row.title}”`}
                        fields={FIELDS}
                        initial={initialFor(row)}
                        action={updateAnnouncement.bind(null, row.id)}
                        columns={2}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        action={deleteAnnouncement.bind(null, row.id)}
                        what="this announcement"
                        description={<>“{row.title}” will be removed.</>}
                        iconOnly
                      />
                    </div>
                  </Td>
                </tr>
              )
            })}
          </AdminTable>
        )}
      </AdminPanel>
    </AdminWriteScope>
  )
}
