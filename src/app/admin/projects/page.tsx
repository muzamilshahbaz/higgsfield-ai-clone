import Link from 'next/link'
import { FolderOpen } from 'lucide-react'

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
import { ActionButton, FilterChips, Pager, SearchFilter } from '@/components/admin/controls'
import { requireCapability } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { getOverview } from '@/services/admin/analytics.service'
import { listProjects } from '@/services/admin/library.service'

import { unarchiveProject } from '../_actions/moderation'

/**
 * Projects.
 *
 * Almost entirely read-only, and that is a decision rather than an omission. A project is
 * one person's filing, and an operator reorganising somebody's folders is not support — it
 * is vandalism with good intentions.
 *
 * The one write is Restore, which undoes a user's mistake rather than overriding their
 * choice: somebody archives a project, then asks for it back. The reverse — archiving
 * somebody's project for them — is deliberately absent, because there is no support request
 * that needs it.
 */

const PAGE_SIZE = 40

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; page?: string }>
}) {
  const actor = await requireCapability('moderation:read', '/admin/projects')
  const params = await searchParams

  const canWrite = can(actor.role, 'moderation:write')
  const page = Math.max(1, Number(params.page ?? '1') || 1)
  const includeDeleted = params.archived === '1'

  const [result, overview] = await Promise.all([
    listProjects({
      search: params.q,
      includeDeleted,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getOverview(),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="Community"
        title="Projects"
        description="Every project, with its owner and how much is filed in it. Read-only, except for restoring one somebody archived by accident."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Projects" value={overview.projects} detail="not archived" icon={FolderOpen} />
        <StatTile label="Generations" value={overview.generations} detail="filed across them" />
        <StatTile label="Accounts" value={overview.users} detail="each gets one by default" />
      </div>

      <AdminPanel
        title="All projects"
        actions={<SearchFilter placeholder="Title or description" className="w-64" />}
        footer="Archiving is the user's own action and is not offered here. A project is somebody's filing, and reorganising it for them is not support."
      >
        <FilterChips
          paramName="archived"
          options={[{ value: '1', label: 'Include archived' }]}
          allLabel="Active only"
        />

        {result.projects.length === 0 ? (
          <AdminEmpty title="Nothing matches." description="Clear the filters and try again." />
        ) : (
          <>
            <div className="mt-5">
              <AdminTable
                head={
                  <>
                    <Th>Project</Th>
                    <Th className="w-44">Owner</Th>
                    <Th numeric className="w-24">
                      Shots
                    </Th>
                    <Th className="w-28">State</Th>
                    <Th numeric className="w-28">
                      Created
                    </Th>
                    <Th className="w-32" />
                  </>
                }
              >
                {result.projects.map((project) => (
                  <tr key={project.id}>
                    <Td className="max-w-[24rem]">
                      <p className="flex items-center gap-2 font-medium">
                        {project.title}
                        {project.is_default && (
                          <Badge variant="secondary" className="text-[10px]">
                            default
                          </Badge>
                        )}
                      </p>
                      {project.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {project.description}
                        </p>
                      )}
                    </Td>

                    <Td>
                      <Link
                        href={`/admin/users/${project.user_id}`}
                        className="text-xs hover:text-brand"
                      >
                        @{project.ownerHandle ?? 'unknown'}
                      </Link>
                      {project.ownerEmail && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {project.ownerEmail}
                        </p>
                      )}
                    </Td>

                    <Td numeric>{project.generationCount}</Td>

                    <Td>
                      {project.deleted_at ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </Td>

                    <Td numeric className="text-xs text-muted-foreground">
                      <RelativeTime value={project.created_at} />
                    </Td>

                    <Td>
                      <div className="flex justify-end">
                        {canWrite && project.deleted_at && (
                          <ActionButton
                            action={unarchiveProject.bind(null, project.id)}
                            icon="restore"
                            variant="ghost"
                            size="sm"
                            successMessage="Restored."
                            confirm={{
                              title: `Restore “${project.title}”?`,
                              description:
                                'It reappears in the owner’s project list with everything still filed in it.',
                              confirmLabel: 'Restore it',
                              tone: 'default',
                            }}
                          >
                            Restore
                          </ActionButton>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <ResultCount shown={result.projects.length} total={result.total} noun="projects" />
            <Pager total={result.total} pageSize={PAGE_SIZE} page={page} />
          </>
        )}
      </AdminPanel>

      {!includeDeleted && (
        <p className="text-xs text-muted-foreground">
          Archived projects are hidden by default. Turn on “Include archived” to find one somebody
          wants back.
        </p>
      )}

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin/users">Open the account list</Link>
      </Button>
    </>
  )
}
