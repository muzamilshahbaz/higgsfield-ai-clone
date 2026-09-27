import Link from 'next/link'
import { EyeOff, Star } from 'lucide-react'

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
import {
  ActionButton,
  DeleteButton,
  FilterChips,
  Pager,
  SearchFilter,
  ToggleAction,
} from '@/components/admin/controls'
import type { FieldSpec } from '@/components/admin/form-spec'
import { RecordDialog } from '@/components/admin/record-form'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { STATUS_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { getOverview } from '@/services/admin/analytics.service'
import { listComments, listShots } from '@/services/admin/moderation.service'

import {
  featureGeneration,
  hideComment,
  hideGeneration,
  publishGeneration,
  removeComment,
  removeGeneration,
} from '../_actions/moderation'

/**
 * Explore moderation.
 *
 * The mechanism is worth reading before using the screen, and the panel says it: hiding a
 * shot sets `visibility = 'private'`, which is the predicate the feed, the permalink, the
 * RLS policies and the sitemap already enforce. It does not add a moderation filter to any
 * of them.
 *
 * That means a hidden shot is hidden everywhere the moment the action returns, rather than
 * everywhere somebody remembered to add a condition. `moderation_status` records why, and
 * is a column this panel reads rather than one the product depends on.
 *
 * Comments are the other way round, because there is no existing mechanism to reuse: they
 * get `is_hidden` and the comment service filters on it. A hide is reversible and leaves
 * the generation's comment count honest about what was said.
 */

const PAGE_SIZE = 24

const VISIBILITY = [
  { value: 'public', label: 'Published' },
  { value: 'private', label: 'Private' },
]

const MODERATION = [
  { value: 'approved', label: 'Approved' },
  { value: 'hidden', label: 'Hidden by a moderator' },
  { value: 'pending', label: 'Pending' },
]

const HIDE_FIELDS: FieldSpec[] = [
  {
    kind: 'textarea',
    name: 'note',
    label: 'Why',
    required: true,
    rows: 3,
    help: 'Recorded in the audit trail and on the row. The next moderator to look at this account reads it.',
  },
]

const REMOVE_FIELDS: FieldSpec[] = [
  {
    kind: 'textarea',
    name: 'reason',
    label: 'Why',
    required: true,
    rows: 3,
    help: 'The files are deleted from storage and the row is soft-deleted. The reason is the only record of the decision.',
  },
]

export default async function AdminExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    visibility?: string
    moderation?: string
    featured?: string
    page?: string
    comments?: string
  }>
}) {
  const actor = await requireCapability('moderation:read', '/admin/explore')
  const params = await searchParams

  const canWrite = can(actor.role, 'moderation:write')
  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [shots, comments, overview] = await Promise.all([
    listShots({
      search: params.q,
      visibility: params.visibility as 'public' | 'private' | undefined,
      moderation: params.moderation as 'approved' | 'hidden' | 'pending' | undefined,
      featuredOnly: params.featured === '1',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listComments({ hiddenOnly: params.comments === 'hidden', limit: 30 }),
    getOverview(),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Explore moderation"
        description="Published work and the comments under it."
        actions={
          <Button asChild variant="outline">
            <Link href="/explore">View the feed</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Published" value={overview.public_shots} tone="brand" />
        <StatTile label="Comments" value={overview.comments} detail={`${overview.comments_hidden} hidden`} />
        <StatTile label="Generations" value={overview.generations} detail="including private" />
        <StatTile
          label="Failed"
          value={overview.generations_failed}
          detail="refunded automatically"
          tone={overview.generations_failed > 0 ? 'warn' : 'default'}
        />
      </div>

      <AdminPanel title="How hiding works">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Hiding a shot sets its visibility to private — the same mechanism the feed, the permalink and
          the row-level security policies already enforce — and records that a moderator did it. No
          read path gained a moderation filter, which is why a hidden shot is hidden everywhere
          immediately rather than everywhere somebody remembered to check.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Removing is the stronger action: the files are deleted from storage and the row is soft
          deleted, so the credit ledger keeps its link to what the charge paid for.
        </p>
      </AdminPanel>

      {/* ---------------------------------------------------------------- shots */}
      <AdminPanel
        title="Shots"
        actions={<SearchFilter placeholder="Prompt, title or handle" className="w-64" />}
      >
        <div className="space-y-3">
          <FilterChips paramName="visibility" options={VISIBILITY} allLabel="Any visibility" />
          <FilterChips paramName="moderation" options={MODERATION} allLabel="Any state" />
          <FilterChips paramName="featured" options={[{ value: '1', label: 'Featured only' }]} allLabel="All" />
        </div>

        {shots.shots.length === 0 ? (
          <AdminEmpty title="Nothing matches." description="Clear the filters and try again." />
        ) : (
          <>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shots.shots.map((shot) => {
                const poster =
                  shot.assets.find((asset) => asset.kind === 'poster') ??
                  shot.assets.find((asset) => asset.kind === 'image')

                return (
                  <li
                    key={shot.id}
                    className="overflow-hidden rounded-xl border border-border bg-surface/40"
                  >
                    <div className="relative aspect-video overflow-hidden bg-surface-2">
                      {poster ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={poster.url}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="blueprint size-full opacity-40" />
                      )}

                      <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                        <Badge
                          variant={shot.visibility === 'public' ? 'success' : 'secondary'}
                          onMedia
                          className="text-[10px]"
                        >
                          {shot.visibility}
                        </Badge>
                        {shot.moderation_status === 'hidden' && (
                          <Badge variant="destructive" onMedia className="text-[10px]">
                            hidden
                          </Badge>
                        )}
                        {shot.is_featured && (
                          <Badge variant="default" onMedia className="gap-1 text-[10px]">
                            <Star className="size-2.5" aria-hidden />
                            featured
                          </Badge>
                        )}
                      </span>
                    </div>

                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-sm leading-relaxed">{shot.prompt || '—'}</p>

                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>@{shot.author_handle ?? 'unknown'}</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono">{shot.model_id}</span>
                        <span aria-hidden>·</span>
                        <Badge
                          variant={shot.status === 'succeeded' ? 'outline' : 'secondary'}
                          className="text-[10px]"
                        >
                          {STATUS_LABELS[shot.status]}
                        </Badge>
                        <span aria-hidden>·</span>
                        <RelativeTime value={shot.created_at} />
                      </p>

                      <p className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                        <span>{shot.like_count} likes</span>
                        <span>{shot.comment_count} comments</span>
                        <span>{shot.download_count} downloads</span>
                      </p>

                      {shot.moderation_note && (
                        <p className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] leading-relaxed">
                          {shot.moderation_note}
                        </p>
                      )}

                      {canWrite && (
                        <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
                          {shot.visibility === 'public' ? (
                            <RecordDialog
                              title="Hide this shot"
                              description="It becomes private immediately — on the feed, at its permalink, and in the sitemap."
                              fields={HIDE_FIELDS}
                              action={hideGeneration.bind(null, shot.id)}
                              submitLabel="Hide it"
                              successMessage="Hidden."
                              trigger={
                                <Button variant="ghost" size="sm">
                                  <EyeOff className="size-4" aria-hidden />
                                  Hide
                                </Button>
                              }
                            />
                          ) : (
                            shot.status === 'succeeded' && (
                              <ActionButton
                                action={publishGeneration.bind(null, shot.id)}
                                variant="ghost"
                                size="sm"
                                successMessage="Published."
                                confirm={{
                                  title: 'Publish this shot?',
                                  description:
                                    'It returns to the public feed and its permalink becomes reachable again.',
                                  confirmLabel: 'Publish it',
                                  tone: 'default',
                                }}
                              >
                                Publish
                              </ActionButton>
                            )
                          )}

                          <span className="ml-auto flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground">Featured</span>
                            <ToggleAction
                              checked={shot.is_featured}
                              action={featureGeneration.bind(null, shot.id)}
                              label="Feature this shot on the landing page"
                              disabled={shot.visibility !== 'public' || shot.status !== 'succeeded'}
                            />
                          </span>

                          <RecordDialog
                            title="Remove this shot"
                            description="The files are deleted from storage. The row is soft deleted so the credit ledger keeps its link to what the charge paid for."
                            fields={REMOVE_FIELDS}
                            action={removeGeneration.bind(null, shot.id)}
                            submitLabel="Remove it"
                            successMessage="Removed."
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-danger"
                              >
                                <span aria-hidden>×</span>
                                <span className="sr-only">Remove this shot</span>
                              </Button>
                            }
                          />
                        </div>
                      )}

                      {shot.visibility === 'public' && (
                        <Button asChild variant="ghost" size="sm" className="w-full">
                          <Link href={`/g/${shot.id}`} target="_blank">
                            Open the permalink
                          </Link>
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <ResultCount shown={shots.shots.length} total={shots.total} noun="shots" />
            <Pager total={shots.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>

      {/* ------------------------------------------------------------- comments */}
      <AdminPanel
        title="Comments"
        description="Hiding is reversible and keeps the count honest. Deleting removes the text from the database and keeps it only in the audit trail."
      >
        <FilterChips
          paramName="comments"
          options={[{ value: 'hidden', label: 'Hidden only' }]}
          allLabel="All comments"
        />

        {comments.comments.length === 0 ? (
          <AdminEmpty title="No comments." />
        ) : (
          <div className="mt-4">
            <AdminTable
              head={
                <>
                  <Th>Comment</Th>
                  <Th className="w-32">Author</Th>
                  <Th className="w-24">State</Th>
                  <Th numeric className="w-28">
                    When
                  </Th>
                  <Th className="w-40" />
                </>
              }
            >
              {comments.comments.map((row) => (
                <tr key={row.id}>
                  <Td className="max-w-[28rem]">
                    <p className={row.is_hidden ? 'text-muted-foreground line-through' : ''}>
                      {row.body}
                    </p>
                    <Link
                      href={`/g/${row.generation_id}`}
                      target="_blank"
                      className="mt-0.5 inline-block font-mono text-[10px] text-muted-foreground hover:text-brand"
                    >
                      on {row.generation_id.slice(0, 8)}
                    </Link>
                  </Td>

                  <Td className="text-xs">@{row.author_handle ?? 'unknown'}</Td>

                  <Td>
                    {row.is_hidden ? (
                      <Badge variant="destructive">Hidden</Badge>
                    ) : (
                      <Badge variant="success">Visible</Badge>
                    )}
                  </Td>

                  <Td numeric className="text-xs text-muted-foreground">
                    <RelativeTime value={row.created_at} />
                  </Td>

                  <Td>
                    {canWrite && (
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          action={hideComment.bind(null, row.id, !row.is_hidden)}
                          variant="ghost"
                          size="sm"
                          successMessage={row.is_hidden ? 'Restored.' : 'Hidden.'}
                        >
                          {row.is_hidden ? 'Restore' : 'Hide'}
                        </ActionButton>
                        <DeleteButton
                          action={removeComment.bind(null, row.id)}
                          what="this comment"
                          description="The text is removed from the database. Hiding is the reversible option — use this only when the content itself must not remain."
                          iconOnly
                        />
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </AdminTable>
            <ResultCount shown={comments.comments.length} total={comments.total} noun="comments" />
          </div>
        )}
      </AdminPanel>
    </>
  )
}
