import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  ResultCount,
  StatTile,
} from '@/components/admin/admin-chrome'
import { DeleteButton, FilterChips, Pager, SearchFilter } from '@/components/admin/controls'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { getOverview } from '@/services/admin/analytics.service'
import { listAssets } from '@/services/admin/library.service'
import type { AssetKind } from '@/types/database'

import { removeAsset } from '../_actions/moderation'

/**
 * Generated files.
 *
 * Every asset the platform has produced, with the job and the owner it belongs to. A grid,
 * for the same reason the media library is one: these are images and video, and a table of
 * storage paths is not how anybody finds the one they were told about.
 *
 * One action, and it is the only one that makes sense here: delete. Everything else about an
 * asset is decided by the generation that produced it, and editing a file's metadata would
 * be editing a record of what a model returned.
 *
 * Deleting removes the storage object and the row, in that order — a failure part-way leaves
 * a row pointing at bytes that still exist, which is recoverable, rather than bytes nothing
 * references, which is not findable. Note that it does not refund the credits: the
 * generation succeeded and was charged for correctly, and an operator tidying storage is not
 * a reason to move money.
 */

const PAGE_SIZE = 36

const KINDS: { value: AssetKind; label: string }[] = [
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'poster', label: 'Posters' },
]

function humanSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default async function AdminAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>
}) {
  const actor = await requireCapability('moderation:read', '/admin/assets')
  const params = await searchParams

  const canWrite = can(actor.role, 'moderation:write')
  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [result, overview] = await Promise.all([
    listAssets({
      search: params.q,
      kind: params.kind as AssetKind | undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getOverview(),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Assets"
        description="Every file the platform has generated, with the job that produced it and the account that owns it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Files" value={overview.assets} />
        <StatTile label="Generations" value={overview.generations} detail="that produced them" />
        <StatTile label="Published" value={overview.public_shots} detail="visible on the feed" tone="brand" />
      </div>

      <AdminPanel
        title="Library"
        actions={<SearchFilter placeholder="Prompt or handle" className="w-64" />}
        footer="Deleting a file does not refund credits. The generation succeeded and was charged for correctly; tidying storage afterwards is not a reason to move money."
      >
        <FilterChips paramName="kind" options={KINDS} allLabel="All kinds" />

        {result.assets.length === 0 ? (
          <AdminEmpty title="Nothing matches." description="Clear the filters and try again." />
        ) : (
          <>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.assets.map((asset) => (
                <li
                  key={asset.id}
                  className="overflow-hidden rounded-xl border border-border bg-surface/40"
                >
                  <div className="relative aspect-video overflow-hidden bg-surface-2">
                    {asset.kind === 'video' ? (
                      <video
                        src={asset.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="size-full object-cover"
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={asset.url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}

                    <span className="absolute left-2 top-2 flex gap-1">
                      <Badge variant="outline" onMedia className="text-[10px]">
                        {asset.kind}
                      </Badge>
                      {asset.visibility === 'public' && (
                        <Badge variant="success" onMedia className="text-[10px]">
                          public
                        </Badge>
                      )}
                    </span>
                  </div>

                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 text-xs leading-relaxed">{asset.prompt || '—'}</p>

                    <p className="flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-muted-foreground">
                      <span>@{asset.ownerHandle ?? 'unknown'}</span>
                      <span aria-hidden>·</span>
                      <span>{humanSize(asset.size_bytes)}</span>
                      {asset.width && asset.height && (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            {asset.width}×{asset.height}
                          </span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <RelativeTime value={asset.created_at} />
                    </p>

                    <div className="flex items-center justify-between gap-1 border-t border-border/60 pt-2">
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="icon-sm">
                          <a href={asset.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" aria-hidden />
                            <span className="sr-only">Open the file</span>
                          </a>
                        </Button>
                        {asset.visibility === 'public' && (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/g/${asset.generation_id}`} target="_blank">
                              Shot
                            </Link>
                          </Button>
                        )}
                      </div>

                      {canWrite && (
                        <DeleteButton
                          action={removeAsset.bind(null, asset.id)}
                          what="this file"
                          description={
                            <>
                              The object is removed from storage and the row from the database. The
                              generation record stays, so the history still shows what was made and
                              what it cost.
                            </>
                          }
                          iconOnly
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <ResultCount shown={result.assets.length} total={result.total} noun="files" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>
    </>
  )
}
