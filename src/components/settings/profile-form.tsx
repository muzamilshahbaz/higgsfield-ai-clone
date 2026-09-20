'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { updateProfileAction } from '@/app/(studio)/settings/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HANDLE_MAX, updateProfileSchema } from '@/lib/validation/profile'
import type { Profile } from '@/services/profile.service'

/**
 * Editing your own profile.
 *
 * The handle is the only field with a real constraint behind it — it is unique
 * case-insensitively — so a taken handle comes back from the server as a field
 * error rather than a toast, landing under the input that caused it.
 */
export function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = React.useState(profile.display_name ?? '')
  const [handle, setHandle] = React.useState(profile.handle)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const dirty = displayName !== (profile.display_name ?? '') || handle !== profile.handle

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    const parsed = updateProfileSchema.safeParse({ displayName, handle })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      setErrors({ [String(issue?.path[0] ?? '_')]: issue?.message ?? 'Check the form.' })
      return
    }

    setErrors({})
    setSaving(true)
    const result = await updateProfileAction(parsed.data)
    setSaving(false)

    if (!result.ok) {
      setErrors({ [result.field || '_']: result.error })
      if (!result.field) toast.error(result.error)
      return
    }

    // Echoed back from the row that was actually written — the schema
    // lowercases the handle, so what was typed and what was saved can differ.
    setDisplayName(result.data.display_name ?? '')
    setHandle(result.data.handle)
    toast.success('Profile saved')
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="display-name">Name</Label>
          <Input
            id="display-name"
            value={displayName}
            maxLength={48}
            placeholder="Ada Lovelace"
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={errors.displayName ? 'display-name-error' : undefined}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {errors.displayName && (
            <p id="display-name-error" className="text-xs text-danger">
              {errors.displayName}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="handle">Handle</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden
            >
              @
            </span>
            <Input
              id="handle"
              value={handle}
              maxLength={HANDLE_MAX}
              className="pl-7"
              aria-invalid={Boolean(errors.handle)}
              aria-describedby={errors.handle ? 'handle-error' : 'handle-hint'}
              onChange={(event) =>
                // Shaped as it is typed, so the field can never hold something
                // the schema would reject a moment later.
                setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
            />
          </div>
          {errors.handle ? (
            <p id="handle-error" className="text-xs text-danger">
              {errors.handle}
            </p>
          ) : (
            <p id="handle-hint" className="text-xs text-muted-foreground">
              How you are credited on anything you publish.
            </p>
          )}
        </div>
      </div>

      {errors._ && (
        <p role="alert" className="text-xs text-danger">
          {errors._}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !dirty}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  )
}
