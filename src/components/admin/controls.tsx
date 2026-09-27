'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * The small interactive pieces the admin list screens are made of.
 *
 * Every one of them follows the same three rules, because they are what make a
 * dense admin table usable rather than frightening:
 *
 *   1. **Optimistic where it is safe, pessimistic where it is not.** A visibility
 *      switch flips immediately and reverts on failure — it is one boolean and the
 *      operator can see the result. A delete waits for the server, because a row
 *      that vanishes and comes back is worse than one that takes 300ms to go.
 *
 *   2. **Every failure says what failed.** The action's message goes into the toast
 *      verbatim. "Something went wrong" is what these components are for avoiding.
 *
 *   3. **Nothing double-fires.** `useTransition` gates every handler, so a
 *      held-down key or an impatient second click is a no-op rather than a second
 *      write.
 */

export type ActionFn = () => Promise<{ ok: boolean; error?: string }>

/**
 * The icons an action button may show, named rather than passed.
 *
 * These components are client components, and the pages that use them are server components. A
 * lucide icon is a `forwardRef` object, which React cannot serialise across that boundary — passing
 * one returns "Functions cannot be passed directly to Client Components" and a 500 for the whole
 * route. A string is data and crosses fine; this map is where it becomes a component again.
 *
 * Deliberately small. These are the verbs an admin action takes, not a general icon set — that is
 * lib/admin/icons.ts, which is the vocabulary an editor picks from.
 */
export type ActionIcon =
  | 'archive'
  | 'restore'
  | 'check'
  | 'delete'
  | 'hide'
  | 'show'
  | 'rotate'

const ACTION_ICONS: Record<ActionIcon, React.ComponentType<{ className?: string }>> = {
  archive: Archive,
  restore: ArchiveRestore,
  check: CheckCircle2,
  delete: Trash2,
  hide: EyeOff,
  show: Eye,
  rotate: RotateCw,
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

/**
 * A switch that saves on change.
 *
 * Optimistic: the thumb moves before the round trip and moves back if the server
 * refuses. A switch that waits 300ms to respond reads as broken, and an operator
 * toggling twelve rows of feature flags would feel every one of them.
 */
export function ToggleAction({
  checked,
  action,
  label,
  successMessage,
  disabled = false,
}: {
  checked: boolean
  action: (next: boolean) => Promise<{ ok: boolean; error?: string }>
  /** For the screen reader, since the visible label is usually the row beside it. */
  label: string
  successMessage?: string
  disabled?: boolean
}) {
  const [optimistic, setOptimistic] = React.useState(checked)
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  // The server is the source of truth: if the row re-renders with a different
  // value — another operator, or a refresh — the switch follows it rather than
  // keeping its own stale idea.
  React.useEffect(() => {
    setOptimistic(checked)
  }, [checked])

  return (
    <Switch
      checked={optimistic}
      disabled={disabled || pending}
      aria-label={label}
      onCheckedChange={(next) => {
        setOptimistic(next)
        startTransition(async () => {
          const result = await action(next)
          if (!result.ok) {
            setOptimistic(!next)
            toast.error(result.error ?? 'Could not change that.')
            return
          }
          if (successMessage) toast.success(successMessage)
          // Refresh so anything derived from this row — a count, a preview, the
          // dashboard's numbers — is not left disagreeing with the switch.
          router.refresh()
        })
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * A button that runs a Server Action.
 *
 * `confirm` turns it into a two-step. The confirm copy is required rather than
 * defaulted, because a generic "Are you sure?" is a dialog people learn to click
 * through — the whole value is in naming what will happen to *this* row.
 */
export function ActionButton({
  action,
  children,
  confirm,
  successMessage,
  variant = 'outline',
  size = 'sm',
  disabled = false,
  className,
  icon,
}: {
  action: ActionFn
  children: React.ReactNode
  confirm?: { title: string; description: React.ReactNode; confirmLabel: string; tone?: 'destructive' | 'default' }
  successMessage?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'accent'
  size?: 'sm' | 'default' | 'icon-sm' | 'icon'
  disabled?: boolean
  className?: string
  /** A name, not a component. See `ActionIcon`. */
  icon?: ActionIcon
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()
  const Icon = icon ? ACTION_ICONS[icon] : null

  function run() {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work.')
        return
      }
      if (successMessage) toast.success(successMessage)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        className={className}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          Icon && <Icon className="size-4" />
        )}
        {children}
      </Button>

      {confirm && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone ?? 'destructive'}
          pending={pending}
          onConfirm={run}
        />
      )}
    </>
  )
}

/** The delete button, with the confirm already wired. */
export function DeleteButton({
  action,
  what,
  description,
  label = 'Delete',
  successMessage = 'Deleted.',
  iconOnly = false,
}: {
  action: ActionFn
  /** Named in the dialog title: "Delete the FAQ entry?" */
  what: string
  description?: React.ReactNode
  label?: string
  successMessage?: string
  iconOnly?: boolean
}) {
  return (
    <ActionButton
      action={action}
      variant="ghost"
      size={iconOnly ? 'icon-sm' : 'sm'}
      icon="delete"
      successMessage={successMessage}
      className="text-muted-foreground hover:text-danger"
      confirm={{
        title: `Delete ${what}?`,
        description:
          description ??
          'This cannot be undone. The change is recorded in the audit trail with what the row held.',
        confirmLabel: label,
      }}
    >
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </ActionButton>
  )
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

/**
 * Up and down, rather than drag and drop.
 *
 * Drag is nicer with a mouse and unusable with a keyboard, on a touch screen inside
 * a scrolling table, and with a screen reader. Two buttons work everywhere, and for
 * a list of eight feature cards the difference in effort is one extra click.
 *
 * The caller owns the ordering: it passes the ids in their current order and this
 * calls back with the new one, so the same component serves every orderable table.
 */
export function ReorderButtons({
  ids,
  id,
  action,
  label,
}: {
  ids: string[]
  id: string
  action: (ordered: string[]) => Promise<{ ok: boolean; error?: string }>
  label: string
}) {
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  const index = ids.indexOf(id)
  const canUp = index > 0
  const canDown = index >= 0 && index < ids.length - 1

  function move(direction: -1 | 1) {
    const target = index + direction
    const here = ids[index]
    const there = ids[target]
    // Guarded rather than swapped blind: `index` is -1 when the id is not in the
    // list, which happens for one render after a delete, and a blind swap would
    // write `undefined` into the order it then posts.
    if (here === undefined || there === undefined) return

    const next = [...ids]
    next[index] = there
    next[target] = here

    startTransition(async () => {
      const result = await action(next)
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save the new order.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canUp || pending}
        onClick={() => move(-1)}
      >
        <ChevronUp className="size-4" aria-hidden />
        <span className="sr-only">Move {label} up</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canDown || pending}
        onClick={() => move(1)}
      >
        <ChevronDown className="size-4" aria-hidden />
        <span className="sr-only">Move {label} down</span>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * A search box that writes to the URL.
 *
 * The query lives in the address bar, which means a filtered list is a link an
 * operator can send to a colleague or bookmark — and the page itself stays a Server
 * Component that reads `searchParams`. A local `useState` filter would have needed
 * the whole table in the browser.
 *
 * Debounced at 350ms. Typing "cinematic" at one navigation per keystroke is nine
 * round trips for one intention.
 */
export function SearchFilter({
  paramName = 'q',
  placeholder = 'Search…',
  className,
}: {
  paramName?: string
  placeholder?: string
  className?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = React.useState(params.get(paramName) ?? '')

  // Re-seeded when the URL changes from somewhere else — a cleared filter, a back
  // button — so the box and the list cannot disagree about what is filtered.
  const fromUrl = params.get(paramName) ?? ''
  React.useEffect(() => {
    setValue(fromUrl)
  }, [fromUrl])

  React.useEffect(() => {
    if (value === fromUrl) return

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value.trim()) next.set(paramName, value.trim())
      else next.delete(paramName)
      // Any change to a filter invalidates the page position.
      next.delete('page')
      router.replace(`?${next.toString()}`, { scroll: false })
    }, 350)

    return () => clearTimeout(timer)
    // `params` and `router` are stable per navigation; including them would restart
    // the timer on every render and the debounce would never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fromUrl, paramName])

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.target.value)}
        className="pl-9"
      />
    </div>
  )
}

/**
 * A row of filter chips that write to the URL.
 *
 * Chips rather than a select, because the whole point on these screens is seeing
 * which filters exist without opening anything — "is there a hidden-only view?" is a
 * question a closed dropdown does not answer.
 */
export function FilterChips({
  paramName,
  options,
  allLabel = 'All',
}: {
  paramName: string
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get(paramName) ?? ''

  function go(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(paramName, value)
    else next.delete(paramName)
    next.delete('page')
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[{ value: '', label: allLabel }, ...options].map((option) => {
        const active = current === option.value
        return (
          <button
            key={option.value || '__all__'}
            type="button"
            aria-pressed={active}
            onClick={() => go(option.value)}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-primary/50 bg-primary/12 text-brand'
                : 'border-border bg-surface/40 text-muted-foreground hover:border-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Previous and next, driven by an offset in the URL.
 *
 * Offset rather than a cursor: these lists are filtered rather than paged through,
 * and an operator who needs page forty needs a better filter. The services cap the
 * range, so a hand-edited offset cannot ask Postgres to walk a million rows.
 */
export function Pager({
  total,
  pageSize,
  page,
}: {
  total: number
  pageSize: number
  page: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const pages = Math.max(1, Math.ceil(total / pageSize))

  if (pages <= 1) return null

  function go(next: number) {
    const search = new URLSearchParams(params.toString())
    if (next <= 1) search.delete('page')
    else search.set('page', String(next))
    router.replace(`?${search.toString()}`, { scroll: false })
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
        Previous
      </Button>
      <p className="text-xs tabular-nums text-muted-foreground">
        Page {page} of {pages}
      </p>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(page + 1)}>
        Next
      </Button>
    </div>
  )
}
