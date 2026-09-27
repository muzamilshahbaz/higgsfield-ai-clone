import Link from 'next/link'

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
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import { getOverview } from '@/services/admin/analytics.service'
import { listLogSources, listSystemLogs } from '@/services/admin/logs.service'
import type { LogLevel } from '@/types/cms'

/**
 * System logs.
 *
 * Application events, as distinct from the audit trail: this answers "what happened", the
 * audit trail answers "who changed this". Mixing them makes both harder to read and gives
 * them the same retention, which is wrong for at least one of them.
 *
 * `context` is rendered as JSON and has been through the same redaction as an audit diff —
 * anything whose key looks like a secret is replaced before it is written. A provider error
 * message is the most likely thing in this app to carry a key fragment, and a log is the last
 * place it should be reconstructable from.
 */

const PAGE_SIZE = 60

const LEVELS: { value: LogLevel; label: string }[] = [
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
]

const LEVEL_VARIANT: Record<LogLevel, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  error: 'destructive',
  warn: 'warning',
  info: 'secondary',
  debug: 'outline',
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; source?: string; q?: string; page?: string }>
}) {
  await requireCapability('logs:read', '/admin/logs')
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [result, sources, overview] = await Promise.all([
    listSystemLogs({
      level: params.level as LogLevel | undefined,
      source: params.source,
      search: params.q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listLogSources(),
    getOverview(),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="System"
        title="System logs"
        description="What the application has been doing. Separate from the audit trail, which records what operators changed."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Errors, 24h"
          value={overview.errors_24h}
          href="/admin/logs?level=error"
          tone={overview.errors_24h > 0 ? 'warn' : 'default'}
        />
        <StatTile label="Entries" value={result.total} detail="matching the current filters" />
        <StatTile label="Sources" value={sources.length} detail="reporting events" />
      </div>

      <AdminPanel
        title="Events"
        actions={<SearchFilter placeholder="Event name or message" className="w-64" />}
        footer="Context payloads are redacted on write: anything whose key looks like a secret — token, api_key, ciphertext — is replaced before it reaches this table."
      >
        <div className="space-y-3">
          <FilterChips paramName="level" options={LEVELS} allLabel="All levels" />
          {sources.length > 0 && (
            <FilterChips
              paramName="source"
              options={sources.map((source) => ({ value: source, label: source }))}
              allLabel="All sources"
            />
          )}
        </div>

        {result.logs.length === 0 ? (
          <AdminEmpty
            title={params.level || params.source || params.q ? 'Nothing matches.' : 'No events recorded yet.'}
            description={
              params.level || params.source || params.q
                ? 'Clear the filters and try again.'
                : 'Events appear here as the application records them — sign-ins, provider failures, sweeper runs.'
            }
          />
        ) : (
          <>
            <div className="mt-5">
              <AdminTable
                head={
                  <>
                    <Th className="w-24">Level</Th>
                    <Th className="w-28">Source</Th>
                    <Th className="w-48">Event</Th>
                    <Th>Message</Th>
                    <Th className="w-28">Account</Th>
                    <Th numeric className="w-32">
                      When
                    </Th>
                  </>
                }
              >
                {result.logs.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      <Badge variant={LEVEL_VARIANT[row.level]}>{row.level}</Badge>
                    </Td>

                    <Td className="text-xs text-muted-foreground">{row.source}</Td>

                    <Td>
                      <code className="font-mono text-[11px]">{row.event}</code>
                    </Td>

                    <Td className="max-w-[26rem]">
                      <p className="line-clamp-2 text-xs leading-relaxed">{row.message || '—'}</p>
                      {row.context && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                            context
                          </summary>
                          <pre className="mt-1 max-w-full overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                            {JSON.stringify(row.context, null, 2)}
                          </pre>
                        </details>
                      )}
                    </Td>

                    <Td className="text-xs">
                      {row.user_id ? (
                        <Link
                          href={`/admin/users/${row.user_id}`}
                          className="font-mono text-[11px] hover:text-brand"
                        >
                          {row.user_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>

                    <Td numeric className="text-xs text-muted-foreground">
                      <RelativeTime value={row.created_at} />
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <ResultCount shown={result.logs.length} total={result.total} noun="entries" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>
    </>
  )
}
