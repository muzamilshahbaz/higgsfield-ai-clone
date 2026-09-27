'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  asString,
  initialValues,
  type FieldSpec,
  type FieldValue,
  type MediaOption,
  type RecordValues,
} from '@/components/admin/form-spec'
import { ICON_NAMES, resolveIcon } from '@/lib/admin/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * The form every CRUD screen in the admin panel uses.
 *
 * Renders a `FieldSpec[]` and hands the values to a Server Action. Three things it
 * gets right once so that fifteen screens do not each get them wrong:
 *
 *   · **A field error lands under its field.** The action's `{ field }` is matched
 *     to the input, `aria-invalid` is set, and focus moves there. A form that
 *     reports "check the form" in a toast and leaves the operator hunting is the
 *     default failure mode of hand-rolled admin forms.
 *
 *   · **Nothing is lost on a refusal.** The state stays local and the form is not
 *     re-mounted, so a rejected save leaves every field exactly as typed. This is
 *     why it is a controlled form rather than a `<form action={…}>` — a server
 *     action on a native form re-renders the tree, and a dialog that unmounts
 *     mid-edit takes the edit with it.
 *
 *   · **The submit button knows it is working.** `useTransition` drives both the
 *     spinner and the disabled state, so a double-click cannot double-post.
 */

export interface RecordFormProps {
  fields: FieldSpec[]
  initial?: RecordValues
  /** Called with the current values. Returns `{ ok }` or `{ ok: false, error, field }`. */
  action: (values: RecordValues) => Promise<{ ok: boolean; error?: string; field?: string }>
  submitLabel?: string
  /** Shown beside Save. Usually a Cancel that closes a dialog. */
  secondary?: React.ReactNode
  /** Sentence confirming what happened. Defaults to "Saved." */
  successMessage?: string
  /** Called after a successful save, for closing a dialog or clearing a create form. */
  onSaved?: () => void
  /** True on a create form: the fields reset to empty after a successful save. */
  resetOnSave?: boolean
  /** The media library, for any `media` field. */
  mediaOptions?: MediaOption[]
  className?: string
  /** Two columns on wide screens. Fields marked `half` then pair up. */
  columns?: 1 | 2
}

export function RecordForm({
  fields,
  initial,
  action,
  submitLabel = 'Save changes',
  secondary,
  successMessage = 'Saved.',
  onSaved,
  resetOnSave = false,
  mediaOptions = [],
  className,
  columns = 1,
}: RecordFormProps) {
  const [values, setValues] = React.useState<RecordValues>(() => initialValues(fields, initial))
  const [fieldError, setFieldError] = React.useState<{ field: string; message: string } | null>(null)
  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)
  const router = useRouter()

  /**
   * Re-seed when the record being edited changes.
   *
   * Keyed on the serialised initial values rather than on a render count: a parent
   * that re-renders for its own reasons must not wipe what somebody is typing, and
   * a parent that swaps in a different row must not leave the previous row's text
   * in the fields.
   */
  const initialKey = JSON.stringify(initial ?? {})
  React.useEffect(() => {
    setValues(initialValues(fields, initial))
    setFieldError(null)
    // `fields` is declared per render by the parent and is structurally stable for
    // a given screen; including it would re-seed on every parent render, which is
    // the bug this effect exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  function set(name: string, value: FieldValue) {
    setValues((current) => ({ ...current, [name]: value }))
    // Clearing on edit rather than on submit: the error is about the value that
    // was there, and leaving it under a field somebody has just fixed is noise.
    setFieldError((current) => (current?.field === name ? null : current))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return

    startTransition(async () => {
      const result = await action(values)

      if (result.ok) {
        toast.success(successMessage)
        setFieldError(null)
        if (resetOnSave) setValues(initialValues(fields))
        onSaved?.()

        /*
         * `revalidatePath` in the action is not enough on its own.
         *
         * It invalidates the server cache, but the router still holds the rendered page it is
         * showing — so a save made in a dialog left the row behind it displaying the old value
         * until somebody navigated away and back. This is what makes the table agree with the
         * thing that was just saved.
         *
         * After `onSaved`, so a dialog closes first and the refresh lands on a settled tree.
         */
        router.refresh()
        return
      }

      const message = result.error ?? 'Could not save that.'

      if (result.field && fields.some((field) => field.name === result.field)) {
        setFieldError({ field: result.field, message })
        // Focus the offending input. Querying the DOM rather than holding fifteen
        // refs: the form is generated, so the name is the only stable handle, and
        // this is the one place that needs it.
        const input = formRef.current?.querySelector<HTMLElement>(`[name="${result.field}"]`)
        input?.focus()
        return
      }

      toast.error(message)
    })
  }

  return (
    <form ref={formRef} onSubmit={submit} className={cn('space-y-5', className)} noValidate>
      <div className={cn(columns === 2 && 'grid gap-5 sm:grid-cols-2')}>
        {fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name]}
            error={fieldError?.field === field.name ? fieldError.message : null}
            onChange={(value) => set(field.name, value)}
            mediaOptions={mediaOptions}
            columns={columns}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// One field
// ---------------------------------------------------------------------------

function Field({
  field,
  value,
  error,
  onChange,
  mediaOptions,
  columns,
}: {
  field: FieldSpec
  value: FieldValue | undefined
  error: string | null
  onChange: (value: FieldValue) => void
  mediaOptions: MediaOption[]
  columns: 1 | 2
}) {
  const id = `field-${field.name}`
  const describedBy = error ? `${id}-error` : field.help ? `${id}-help` : undefined

  // A boolean is a row, not a stacked label-over-control, so it renders its own
  // shape rather than going through the wrapper below.
  if (field.kind === 'boolean') {
    return (
      <div
        className={cn(
          'flex items-start justify-between gap-4 rounded-lg border border-border bg-surface/40 p-4',
          columns === 2 && 'sm:col-span-2',
        )}
      >
        <div className="min-w-0">
          <Label htmlFor={id} className="cursor-pointer">
            {field.label}
          </Label>
          {field.help && (
            <p id={`${id}-help`} className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {field.help}
            </p>
          )}
        </div>
        <Switch
          id={id}
          name={field.name}
          checked={value === true}
          onCheckedChange={(next) => onChange(next)}
          aria-describedby={field.help ? `${id}-help` : undefined}
        />
      </div>
    )
  }

  const spansOne = columns === 2 && 'half' in field && field.half

  return (
    <div className={cn('space-y-2', columns === 2 && !spansOne && 'sm:col-span-2')}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>
          {field.label}
          {'required' in field && field.required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </Label>

        {/* The counter is for the fields that have a database limit behind them,
            so somebody finds out before Postgres tells them. */}
        {'maxLength' in field && field.maxLength && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {asString(value).length}/{field.maxLength}
          </span>
        )}
      </div>

      <Control
        id={id}
        field={field}
        value={value}
        invalid={Boolean(error)}
        describedBy={describedBy}
        onChange={onChange}
        mediaOptions={mediaOptions}
      />

      {error ? (
        <p id={`${id}-error`} className="text-xs leading-relaxed text-danger">
          {error}
        </p>
      ) : (
        field.help && (
          <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
            {field.help}
          </p>
        )
      )}
    </div>
  )
}

function Control({
  id,
  field,
  value,
  invalid,
  describedBy,
  onChange,
  mediaOptions,
}: {
  id: string
  field: FieldSpec
  value: FieldValue | undefined
  invalid: boolean
  describedBy?: string
  onChange: (value: FieldValue) => void
  mediaOptions: MediaOption[]
}) {
  const shared = {
    id,
    name: field.name,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
  } as const

  switch (field.kind) {
    case 'text':
      return (
        <Input
          {...shared}
          value={asString(value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          disabled={field.disabled}
          className={field.mono ? 'font-mono text-[13px]' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'textarea':
      return (
        <Textarea
          {...shared}
          value={asString(value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          rows={field.rows ?? 4}
          className={field.mono ? 'font-mono text-[13px]' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input
            {...shared}
            type="number"
            inputMode="numeric"
            value={typeof value === 'number' ? value : asString(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            className="tabular-nums"
            onChange={(event) => {
              // Empty is kept as '' rather than coerced to 0, so clearing a field
              // does not silently save a zero somebody did not type.
              const raw = event.target.value
              onChange(raw === '' ? '' : Number(raw))
            }}
          />
          {field.unit && (
            <span className="shrink-0 text-sm text-muted-foreground">{field.unit}</span>
          )}
        </div>
      )

    case 'select': {
      const current = asString(value)
      // Radix Select cannot hold '' as a value, so the empty option carries a
      // sentinel and is translated back on the way out.
      const EMPTY = '__none__'
      return (
        <Select
          value={current || (field.allowEmpty ? EMPTY : '')}
          onValueChange={(next) => onChange(next === EMPTY ? '' : next)}
        >
          <SelectTrigger id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy}>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {field.allowEmpty && (
              <SelectItem value={EMPTY}>{field.emptyLabel ?? '— none —'}</SelectItem>
            )}
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
          {/* The hidden input is what `querySelector('[name=…]')` finds when the
              action reports an error against this field. Radix renders a button. */}
          <input type="hidden" name={field.name} value={current} />
        </Select>
      )
    }

    case 'tags':
      return (
        <TagsInput
          id={id}
          name={field.name}
          value={Array.isArray(value) ? value : []}
          placeholder={field.placeholder}
          invalid={invalid}
          describedBy={describedBy}
          onChange={onChange}
        />
      )

    case 'icon':
      return (
        <IconPicker
          id={id}
          name={field.name}
          value={asString(value)}
          describedBy={describedBy}
          onChange={onChange}
        />
      )

    case 'media':
      return (
        <MediaPicker
          id={id}
          name={field.name}
          value={asString(value)}
          options={mediaOptions}
          describedBy={describedBy}
          onChange={onChange}
        />
      )

    case 'json':
      return (
        <Textarea
          {...shared}
          value={asString(value)}
          rows={field.rows ?? 6}
          spellCheck={false}
          className="font-mono text-[12px] leading-relaxed"
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'datetime':
      return (
        <Input
          {...shared}
          type="datetime-local"
          value={asString(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'color':
      return (
        <div className="flex items-center gap-2">
          {/*
            A swatch rather than `<input type="color">`. The stored values are
            `oklch()` strings and the native picker only speaks hex, so it would
            round-trip a wide-gamut colour into sRGB the moment somebody opened it.
            The preview shows the real value; the text field edits it.
          */}
          <span
            className="size-10 shrink-0 rounded-lg border border-border"
            style={{ background: asString(value) || 'transparent' }}
            aria-hidden
          />
          <Input
            {...shared}
            value={asString(value)}
            spellCheck={false}
            className="font-mono text-[13px]"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )

    case 'readonly':
      return (
        <div
          id={id}
          className="flex min-h-10 items-center rounded-lg border border-border bg-surface-2/40 px-3 py-2 font-mono text-[13px] text-muted-foreground"
        >
          {asString(value) || '—'}
        </div>
      )

    // `boolean` is handled by `Field` above, which is why it cannot appear here.
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Composite controls
// ---------------------------------------------------------------------------

/**
 * Tags as chips.
 *
 * Enter and comma both commit, because both are what people type. Backspace on an
 * empty input removes the last chip, which is the behaviour every tag field has and
 * the one nobody notices until it is missing.
 */
function TagsInput({
  id,
  name,
  value,
  placeholder,
  invalid,
  describedBy,
  onChange,
}: {
  id: string
  name: string
  value: string[]
  placeholder?: string
  invalid: boolean
  describedBy?: string
  onChange: (value: string[]) => void
}) {
  const [draft, setDraft] = React.useState('')

  function commit() {
    const next = draft.trim().replace(/,$/, '')
    if (!next) return
    // Case-insensitive de-dupe: `Cinematic` and `cinematic` as two tags is a
    // filter that silently splits in half.
    if (!value.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      onChange([...value, next])
    }
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <Input
        id={id}
        name={name}
        value={draft}
        placeholder={placeholder ?? 'Type a tag and press Enter'}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            commit()
            return
          }
          if (event.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        // Committing on blur as well, so a tag typed and then clicked away from is
        // not silently discarded on save.
        onBlur={commit}
      />

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onChange(value.filter((entry) => entry !== tag))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/60 py-1 pl-2.5 pr-1.5 text-xs transition-colors hover:border-danger/50 hover:text-danger"
              >
                {tag}
                <X className="size-3" aria-hidden />
                <span className="sr-only">Remove {tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The icon picker.
 *
 * A grid of the allow-list with previews, because an icon chosen from a text field
 * is an icon somebody has to guess the name of. The allow-list is why this can
 * render every option at once — see lib/admin/icons.ts for why it is not the whole
 * library.
 */
function IconPicker({
  id,
  name,
  value,
  describedBy,
  onChange,
}: {
  id: string
  name: string
  value: string
  describedBy?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <input type="hidden" id={id} name={name} value={value} />
      <div
        role="radiogroup"
        aria-label="Icon"
        aria-describedby={describedBy}
        className="grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface/40 p-2 sm:grid-cols-10"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          onClick={() => onChange('')}
          title="No icon"
          className={cn(
            'flex aspect-square items-center justify-center rounded-md border text-[10px] transition-colors',
            !value
              ? 'border-primary bg-primary/10 text-brand'
              : 'border-transparent text-muted-foreground hover:bg-surface-2',
          )}
        >
          none
        </button>

        {ICON_NAMES.map((iconName) => {
          const Icon = resolveIcon(iconName)
          const selected = value === iconName
          return (
            <button
              key={iconName}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(iconName)}
              title={iconName}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md border transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-brand'
                  : 'border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="sr-only">{iconName}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The media picker.
 *
 * Thumbnails, because an image chosen from a dropdown of slugs is an image chosen
 * by luck. Grouped by folder in the label so a list of eighty is navigable.
 */
function MediaPicker({
  id,
  name,
  value,
  options,
  describedBy,
  onChange,
}: {
  id: string
  name: string
  value: string
  options: MediaOption[]
  describedBy?: string
  onChange: (value: string) => void
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        The media library is empty. Upload an image under Media first.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <input type="hidden" id={id} name={name} value={value} />
      <div
        role="radiogroup"
        aria-label="Image"
        aria-describedby={describedBy}
        className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-border bg-surface/40 p-2 sm:grid-cols-5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          onClick={() => onChange('')}
          className={cn(
            'flex aspect-video items-center justify-center rounded-md border text-[11px] transition-colors',
            !value
              ? 'border-primary bg-primary/10 text-brand'
              : 'border-border text-muted-foreground hover:bg-surface-2',
          )}
        >
          None
        </button>

        {options.map((option) => {
          const selected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              title={`${option.folder} / ${option.label}`}
              className={cn(
                'relative aspect-video overflow-hidden rounded-md border transition-colors',
                selected ? 'border-primary' : 'border-border hover:border-muted',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={option.url}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
              {selected && (
                <span
                  className="absolute inset-0 ring-2 ring-inset ring-primary"
                  aria-hidden
                />
              )}
              <span className="sr-only">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The same form in a dialog, for a create or edit that is not the whole page.
 *
 * `Plus` on the trigger by default because the overwhelming majority of uses are
 * "New …". A caller that wants a different trigger passes one.
 */
export function RecordDialog({
  title,
  description,
  trigger,
  triggerLabel = 'New',
  triggerVariant = 'default',
  ...formProps
}: RecordFormProps & {
  title: string
  description?: string
  trigger?: React.ReactNode
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline' | 'ghost' | 'secondary'
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger ?? (
          <Button variant={triggerVariant}>
            <Plus className="size-4" aria-hidden />
            {triggerLabel}
          </Button>
        )}
      </span>

      <DialogShell open={open} onOpenChange={setOpen} title={title} description={description}>
        <RecordForm
          {...formProps}
          onSaved={() => {
            setOpen(false)
            formProps.onSaved?.()
          }}
          secondary={
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          }
        />
      </DialogShell>
    </>
  )
}

/**
 * A dialog whose body scrolls.
 *
 * `DialogContent` is already a flex column with a max height and `overflow-hidden`,
 * so the scroll belongs on the body rather than on the panel — putting it on the
 * panel scrolls the header and the close button out of reach. `min-h-0` is what
 * lets the body actually shrink inside the flex column; without it a twelve-field
 * form pushes its own Save button past the bottom edge.
 */
function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="mt-1.5">{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
