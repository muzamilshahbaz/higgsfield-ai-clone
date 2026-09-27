import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The static furniture every admin screen is built from.
 *
 * Server components, all of them: a page header and a stat tile have no state, and
 * making them client components would pull the whole admin panel into the browser
 * bundle for the sake of a heading. The interactive pieces live in their own
 * `'use client'` files beside this one.
 */

/**
 * The top of every screen.
 *
 * `eyebrow` carries the section the page is in, because the sidebar is hidden on a
 * phone and a heading with no context reads as the whole app. `actions` sits on the
 * same line on wide screens and wraps under on narrow ones — the alternative, a
 * button row that squeezes the title, is how admin headers end up two lines of
 * truncated text.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-2xl font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/**
 * A titled block. The panel every screen groups its controls in.
 *
 * `footer` is for the sentence that explains a consequence — which surface this
 * setting changes, what happens on save. Those belong at the bottom of the panel
 * they apply to rather than in a tooltip.
 */
export function AdminPanel({
  title,
  description,
  actions,
  footer,
  children,
  className,
}: {
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('panel overflow-hidden rounded-xl', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[15px] font-medium">{title}</h2>}
            {description && (
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="p-5">{children}</div>

      {footer && (
        <div className="border-t border-border bg-surface-2/30 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  )
}

/**
 * One number.
 *
 * `tone` exists for the two that mean something is wrong — failed jobs, errors in
 * the last day. Coral rather than red: this is a figure to notice, not an alarm, and
 * the destructive red in this palette is reserved for an action that destroys
 * something.
 */
export function StatTile({
  label,
  value,
  detail,
  href,
  tone = 'default',
  icon: Icon,
}: {
  label: string
  value: string | number
  detail?: string
  href?: string
  tone?: 'default' | 'brand' | 'credit' | 'warn'
  icon?: LucideIcon
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
      </div>

      <p
        className={cn(
          'mt-3 font-display text-3xl font-semibold leading-none tabular-nums',
          tone === 'brand' && 'text-brand',
          tone === 'credit' && 'text-credit',
          tone === 'warn' && 'text-accent',
        )}
      >
        {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
      </p>

      {detail && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>}
    </>
  )

  if (!href) {
    return <div className="panel rounded-xl p-5">{body}</div>
  }

  return (
    <Link
      href={href}
      className="panel group relative rounded-xl p-5 transition-colors hover:border-brand/40"
    >
      {body}
      <ArrowUpRight
        className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  )
}

/**
 * The "nothing here" state.
 *
 * Always says what to do next rather than only that the list is empty. An empty
 * table with no next step is the one screen an operator cannot get past.
 */
export function AdminEmpty({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description && (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  )
}

/**
 * A table that scrolls sideways rather than squeezing.
 *
 * Ten columns of audit data does not fit a phone and never will. A horizontal
 * scroll with the first column readable beats six columns of two-character
 * ellipses, which is what `table-layout: auto` does at that width.
 */
export function AdminTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('-mx-5 overflow-x-auto px-5', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">{head}</tr>
        </thead>
        <tbody className="divide-y divide-border/70">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({
  children,
  className,
  numeric = false,
}: {
  children?: React.ReactNode
  className?: string
  numeric?: boolean
}) {
  return (
    <th
      scope="col"
      className={cn(
        'eyebrow whitespace-nowrap pb-2.5 pr-4 font-medium text-muted-foreground',
        numeric && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  numeric = false,
}: {
  children?: React.ReactNode
  className?: string
  numeric?: boolean
}) {
  return (
    <td
      className={cn(
        'py-3 pr-4 align-middle',
        numeric && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * A key/value row, for the detail panels.
 *
 * `<dl>` semantics, because that is what these are, and a screen reader announcing
 * "Status, suspended" is worth the two extra elements over a flex div.
 */
export function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border/60 py-2.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/**
 * The count under a list.
 *
 * Spelled out — "showing 40 of 213" — rather than a page number, because the admin
 * lists are filter-driven and "page 3 of 6" tells an operator nothing about whether
 * their filter is working.
 */
export function ResultCount({
  shown,
  total,
  noun,
}: {
  shown: number
  total: number
  noun: string
}) {
  if (total === 0) return null
  return (
    <p className="mt-4 text-xs tabular-nums text-muted-foreground">
      Showing {shown.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')} {noun}
    </p>
  )
}
