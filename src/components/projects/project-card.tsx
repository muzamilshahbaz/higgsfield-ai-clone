'use client'

import Link from 'next/link'
import { FolderOpen, Images, MoreVertical, Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RelativeTime } from '@/components/ui/relative-time'
import type { ProjectSummary } from '@/services/project.service'

/**
 * One project tile.
 *
 * The whole card is a link and the menu sits above it rather than inside it —
 * a button nested in an anchor is invalid markup and, in practice, a menu that
 * navigates away the moment it is opened.
 */
export function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectSummary
  onRename: (project: ProjectSummary) => void
  onDelete: (project: ProjectSummary) => void
}) {
  return (
    <div className="group relative">
      <Link
        href={`/projects/${project.id}`}
        className="panel block overflow-hidden rounded-xl transition-colors hover:border-brand/40"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface">
          {project.previewUrl ? (
            project.previewIsVideo ? (
              <video
                src={project.previewUrl}
                className="size-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              // Not next/image: Supabase Storage and provider CDNs are not in
              // next.config's remotePatterns, and an optimiser that 500s on an
              // unknown host would take the whole grid down.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.previewUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
              />
            )
          ) : (
            <div className="blueprint flex size-full items-center justify-center opacity-70">
              <FolderOpen className="size-6 text-muted-foreground" aria-hidden />
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />

          {project.is_default && (
            <span className="absolute left-2.5 top-2.5">
              <Badge variant="secondary" onMedia>
                Default
              </Badge>
            </span>
          )}
        </div>

        <div className="space-y-1.5 p-4">
          <p className="truncate font-display text-[15px] font-medium">{project.title}</p>

          {project.description && (
            <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
              {project.description}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Images className="size-3" aria-hidden />
              {project.generationCount}
              <span className="sr-only">
                {project.generationCount === 1 ? ' shot' : ' shots'}
              </span>
            </span>
            {project.lastActivityAt && (
              <RelativeTime value={project.lastActivityAt} className="ml-auto" />
            )}
          </div>
        </div>
      </Link>

      <div className="absolute right-2.5 top-2.5 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${project.title}`}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:border-muted hover:text-foreground"
          >
            <MoreVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onRename(project)}>
              <Pencil className="size-4" aria-hidden />
              Rename
            </DropdownMenuItem>

            {!project.is_default && (
              <DropdownMenuItem onSelect={() => onDelete(project)} variant="destructive">
                <Trash2 className="size-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
