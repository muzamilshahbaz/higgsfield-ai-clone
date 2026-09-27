import Link from 'next/link'

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  ResultCount,
  Td,
  Th,
} from '@/components/admin/admin-chrome'
import { FilterChips, Pager, SearchFilter } from '@/components/admin/controls'
import { requireCapability } from '@/lib/admin/guard'
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import { listAuditFacets, listAuditLog } from '@/services/admin/logs.service'

/**
 * The audit trail.
 *
 * Append-only by design and by grant: there is no update or delete path anywhere in the
 * application, the schema map types `Update` as `never`, and row-level security denies
 * everything to anon and authenticated. The service role is the only reader, and this page is
 * the only reader of the service role.
 *
 * `before` and `after` hold the changed fields only, not whole rows, and they have been
 * through redaction — anything whose key looks like a secret is replaced before it is
 * written. An audit trail that records the key somebody rotated is a second copy of that key,
 * in a table with different access rules from the vault it came out of.
 *
 * The actor's email and role are stored on the row rather than joined, because the point of an
 * audit entry is that it still makes sense after the account that wrote it has been deleted.
 */

const PAGE_SIZE = 60

const DESTRUCTIVE = new Set(['delete', 'ban', 'suspended', 'banned', 'hide'])
const NOTABLE = new Set(['rotate', 'role_change', 'credit_adjust', 'disable'])

function variantFor(action: string): 'destructive' | 'warning' | 'default' | 'secondary' {
  if (DESTRUCTIVE.has(action)) return 'destructive'
  if (NOTABLE.has(action)) return 'warning'
  if (action === 'create') return 'default'
  return 'secondary'
}

/** A compact rendering of one side of a diff. */
function DiffBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null
  const text = JSON.stringify(value, null, 2)
  if (!text || text === '{}') return null

  return (
    <div className="min-w-0">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        {text}
      </pre>
    </div>
  )
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; q?: string; page?: string }>
}) {
  await requireCapability('logs:read', '/admin/audit')
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const [result, facets] = await Promise.all([
    listAuditLog({
      entity: params.entity,
      action: params.action,
      search: params.q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listAuditFacets(),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="System"
        title="Audit trail"
        description="Every change an operator has made, who made it, and what the value was before."
      />

      <AdminPanel
        title="Changes"
        actions={<SearchFilter placeholder="Summary or operator email" className="w-64" />}
        footer="Append-only. There is no edit or delete path for these rows anywhere in the application — the schema types the update shape as `never`, which is the compiler enforcing what the design says."
      >
        <div className="space-y-3">
          {facets.entities.length > 0 && (
            <FilterChips
              paramName="entity"
              options={facets.entities.map((entity) => ({ value: entity, label: entity }))}
              allLabel="Everything"
            />
          )}
          {facets.actions.length > 0 && (
            <FilterChips
              paramName="action"
              options={facets.actions.map((action) => ({ value: action, label: action }))}
              allLabel="All actions"
            />
          )}
        </div>

        {result.entries.length === 0 ? (
          <AdminEmpty
            title={
              params.entity || params.action || params.q
                ? 'Nothing matches.'
                : 'No changes recorded yet.'
            }
            description={
              params.entity || params.action || params.q
                ? 'Clear the filters and try again.'
                : 'The first edit anybody makes in this panel will appear here, with what it replaced.'
            }
          />
        ) : (
          <>
            <div className="mt-5">
              <AdminTable
                head={
                  <>
                    <Th className="w-28">Action</Th>
                    <Th className="w-28">Entity</Th>
                    <Th>What changed</Th>
                    <Th className="w-44">Operator</Th>
                    <Th numeric className="w-32">
                      When
                    </Th>
                  </>
                }
              >
                {result.entries.map((entry) => (
                  <tr key={entry.id}>
                    <Td>
                      <Badge variant={variantFor(entry.action)} className="font-mono text-[10px]">
                        {entry.action}
                      </Badge>
                    </Td>

                    <Td className="text-xs text-muted-foreground">{entry.entity}</Td>

                    <Td className="max-w-[30rem]">
                      <p className="text-sm leading-relaxed">{entry.summary}</p>

                      {entry.entity_id && (
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {entry.entity === 'user' ? (
                            <Link
                              href={`/admin/users/${entry.entity_id}`}
                              className="hover:text-brand"
                            >
                              {entry.entity_id}
                            </Link>
                          ) : (
                            entry.entity_id
                          )}
                        </p>
                      )}

                      {(entry.before || entry.after) && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                            diff
                          </summary>
                          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                            <DiffBlock label="Before" value={entry.before} />
                            <DiffBlock label="After" value={entry.after} />
                          </div>
                        </details>
                      )}
                    </Td>

                    <Td>
                      <p className="truncate text-xs">{entry.actor_email ?? 'unknown'}</p>
                      {entry.actor_role && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.actor_role}</p>
                      )}
                      {entry.ip && (
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                          {entry.ip}
                        </p>
                      )}
                    </Td>

                    <Td numeric className="text-xs text-muted-foreground">
                      <RelativeTime value={entry.created_at} />
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <ResultCount shown={result.entries.length} total={result.total} noun="changes" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>

      <AdminPanel title="What is not in a diff">
        <ul className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Secrets.</span> Any field whose name looks
            like a credential — token, api_key, ciphertext, password — is replaced with{' '}
            <code className="font-mono">[redacted]</code> before the row is written. A key rotation
            records that it happened and the last four digits, never the key.
          </li>
          <li>
            <span className="font-medium text-foreground">Operator notes about a person.</span> The
            note field on an account is deliberately kept out of the diff: it is free text about
            somebody, and a second copy in an append-only table is a copy nobody can later redact.
          </li>
          <li>
            <span className="font-medium text-foreground">Unchanged fields.</span> Only what actually
            differed is stored. A save that changed one value records one value, which is what makes
            the interesting change findable.
          </li>
        </ul>
      </AdminPanel>
    </>
  )
}
