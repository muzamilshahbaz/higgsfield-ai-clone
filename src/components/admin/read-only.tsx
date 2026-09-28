'use client'

import * as React from 'react'
import { Eye } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Read-only mode for the whole panel.
 *
 * One boolean, provided once by the admin layout from the operator's role, and
 * consumed by the handful of components that can change something: the record
 * form and its dialog, the toggle, the action button, the delete button, the
 * reorder arrows, and the two media forms. Every mutating control in the panel
 * is one of those, which is what makes a single provider enough — there is no
 * page that has to remember to ask.
 *
 * It is emphatically *not* the authorization. A read-only admin holds no
 * `:write` capability, so every Server Action refuses them in `authorize()`
 * before it reads its arguments; this provider exists so they are not offered a
 * button that would be refused. Deleting this file would change nothing about
 * what a viewer can do to the database — it would only make the panel lie about
 * it.
 *
 * Disabled rather than hidden, deliberately. A screen with its buttons removed
 * reads as broken or half-loaded, and a support person looking at it cannot tell
 * whether the product lacks the feature or their account lacks the grant. A
 * greyed control with a title saying why answers both.
 */

interface ReadOnlyState {
  readOnly: boolean
  /** Shown in `title` on every disabled control, so hovering explains it. */
  reason: string
}

const AdminReadOnlyContext = React.createContext<ReadOnlyState>({
  readOnly: false,
  reason: '',
})

export function AdminReadOnlyProvider({
  readOnly,
  roleLabel,
  children,
}: {
  readOnly: boolean
  roleLabel: string
  children: React.ReactNode
}) {
  const value = React.useMemo(
    () => ({
      readOnly,
      reason: readOnly ? `${roleLabel}: this account can view but not change anything.` : '',
    }),
    [readOnly, roleLabel],
  )

  return <AdminReadOnlyContext.Provider value={value}>{children}</AdminReadOnlyContext.Provider>
}

export function useAdminReadOnly(): ReadOnlyState {
  return React.useContext(AdminReadOnlyContext)
}

/**
 * Narrows read-only mode to one screen.
 *
 * The layout's provider answers "can this role change anything at all", which is
 * the right question for a read-only admin and the wrong one for a moderator
 * standing on the landing-page editor: they hold plenty of write capabilities,
 * just not `content:write`, and an enabled Save button that the server then
 * refuses is the interface lying.
 *
 * So each screen that can be *read* by a role that cannot *write* it declares
 * which way round that is, once, at the top. It only ever tightens: a screen
 * cannot hand write access back to somebody the layout has already established
 * cannot write anything.
 */
export function AdminWriteScope({
  canWrite,
  children,
}: {
  canWrite: boolean
  children: React.ReactNode
}) {
  const parent = useAdminReadOnly()

  const value = React.useMemo<ReadOnlyState>(() => {
    if (parent.readOnly) return parent
    if (canWrite) return parent
    return {
      readOnly: true,
      reason: 'Your role can read this screen but not change it.',
    }
  }, [parent, canWrite])

  return <AdminReadOnlyContext.Provider value={value}>{children}</AdminReadOnlyContext.Provider>
}

/**
 * The props a disabled control needs, or nothing.
 *
 * Returned as a spreadable object so a control adds read-only support in one
 * line without an `if` around its own props:
 *
 *   <Button {...readOnlyProps(readOnly, reason)} onClick={…} />
 *
 * `aria-disabled` rides along with `disabled` because a native disabled button
 * is skipped by some screen reader cursors entirely, and "why can I not find the
 * Save button" is the worst version of this experience.
 */
export function useReadOnlyProps(alsoDisabled = false) {
  const { readOnly, reason } = useAdminReadOnly()
  return {
    readOnly,
    disabled: readOnly || alsoDisabled,
    'aria-disabled': readOnly || alsoDisabled || undefined,
    title: readOnly ? reason : undefined,
  }
}

/** The badge itself. Rendered in the sidebar, the user menu and the page banner. */
export function ReadOnlyBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1 border-brand/40 text-brand', className)}>
      <Eye className="size-3" aria-hidden />
      Read only
    </Badge>
  )
}

/**
 * The strip at the top of every admin page, when the operator cannot write.
 *
 * Says it once per page rather than once per control. It renders nothing at all
 * for everybody else, so it costs an editor nothing to have it in the layout.
 */
export function ReadOnlyNotice() {
  const { readOnly } = useAdminReadOnly()
  if (!readOnly) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-brand/25 bg-primary/5 px-3.5 py-2.5 text-sm">
      <ReadOnlyBadge />
      <p className="text-muted-foreground">
        You can open every screen and search every table. Creating, editing, deleting,
        uploading and publishing are turned off for this role.
      </p>
    </div>
  )
}
