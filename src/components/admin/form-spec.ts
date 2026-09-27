/**
 * The field vocabulary the admin forms are built from.
 *
 * Fifteen CRUD screens, and almost all of them are the same six controls over
 * different columns. Written as bespoke forms that is fifteen places to get the
 * label association wrong, fifteen places where a textarea forgets its character
 * counter, and fifteen different opinions about where the help text goes.
 *
 * So a screen declares its fields as data and `RecordForm` renders them. The
 * payoff is not the line count — it is that a fix to focus handling, or to how an
 * error is attached to a field, happens once. The cost is that a screen with a
 * genuinely unusual control has to write it by hand, which two of them do.
 *
 * Not a client module: the specs are declared in Server Components and passed
 * down, so this file must be importable from both.
 */

export interface FieldOption {
  value: string
  label: string
  /** Shown under the label in a radio-style picker. Ignored by a plain select. */
  hint?: string
}

/** A media library entry, for the `media` field's picker. */
export interface MediaOption {
  id: string
  label: string
  url: string
  folder: string
}

export type FieldSpec =
  | {
      kind: 'text'
      name: string
      label: string
      help?: string
      placeholder?: string
      required?: boolean
      maxLength?: number
      /** For slugs, ids and colour tokens — anything read character by character. */
      mono?: boolean
      /** Half-width on a two-column grid. */
      half?: boolean
      disabled?: boolean
    }
  | {
      kind: 'textarea'
      name: string
      label: string
      help?: string
      placeholder?: string
      required?: boolean
      maxLength?: number
      rows?: number
      mono?: boolean
    }
  | {
      kind: 'number'
      name: string
      label: string
      help?: string
      min?: number
      max?: number
      step?: number
      half?: boolean
      /** Rendered after the input: "credits", "MB", "minutes". */
      unit?: string
    }
  | { kind: 'boolean'; name: string; label: string; help?: string }
  | {
      kind: 'select'
      name: string
      label: string
      options: FieldOption[]
      help?: string
      /** Adds a "— none —" entry, for a nullable column. */
      allowEmpty?: boolean
      emptyLabel?: string
      half?: boolean
    }
  | { kind: 'tags'; name: string; label: string; help?: string; placeholder?: string }
  | { kind: 'icon'; name: string; label: string; help?: string }
  | { kind: 'media'; name: string; label: string; help?: string }
  | { kind: 'json'; name: string; label: string; help?: string; rows?: number }
  | { kind: 'datetime'; name: string; label: string; help?: string; half?: boolean }
  | { kind: 'color'; name: string; label: string; help?: string; half?: boolean }
  /** A read-only row, for a value the form shows but must not let anyone change. */
  | { kind: 'readonly'; name: string; label: string; help?: string }

export type FieldValue = string | number | boolean | string[] | null
export type RecordValues = Record<string, FieldValue>

/**
 * The value a field starts empty at.
 *
 * Per kind rather than a blanket `''`, because a boolean that starts as the empty
 * string is a boolean that saves as `false` by accident, and a tags field that
 * starts as a string breaks the first `.map` that touches it.
 */
export function emptyValue(field: FieldSpec): FieldValue {
  switch (field.kind) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'tags':
      return []
    case 'json':
      return '{}'
    default:
      return ''
  }
}

export function initialValues(fields: FieldSpec[], initial?: RecordValues): RecordValues {
  const values: RecordValues = {}
  for (const field of fields) {
    const provided = initial?.[field.name]
    values[field.name] = provided === undefined || provided === null ? emptyValue(field) : provided
  }
  return values
}

// ---------------------------------------------------------------------------
// Coercion, for the action that receives the values
// ---------------------------------------------------------------------------

/**
 * These live here rather than in each action because the form and the action have
 * to agree about what a field produces, and the only way to guarantee that is for
 * both to read the same file.
 *
 * All of them are forgiving in the same direction: an unexpected shape becomes the
 * fallback rather than throwing. A Server Action is a public endpoint — anyone can
 * post anything to it — so these are a coercion layer, not a validation layer. The
 * validation that matters is the check constraint in Postgres and the explicit
 * rules in each service.
 */

export function asString(value: FieldValue | undefined, fallback = ''): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return fallback
}

/** Like `asString`, but an empty field means `null` rather than `''`. */
export function asNullableString(value: FieldValue | undefined): string | null {
  const text = asString(value)
  return text ? text : null
}

export function asNumber(value: FieldValue | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

export function asBoolean(value: FieldValue | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function asStringArray(value: FieldValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * A jsonb payload from a textarea.
 *
 * Returns the fallback on anything unparseable, and the caller decides whether
 * that is acceptable — the section config form reports it as a field error rather
 * than silently saving `{}` over somebody's settings.
 */
export function asJson(value: FieldValue | undefined): { ok: true; data: unknown } | { ok: false } {
  const text = asString(value)
  if (!text) return { ok: true, data: {} }
  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/**
 * A `datetime-local` value as an ISO instant, or null.
 *
 * The input hands back local wall-clock text with no zone (`2026-09-27T14:30`),
 * which `new Date()` interprets in the *server's* zone when it reaches an action.
 * Converting in the browser, where the operator's own zone applies, is the only
 * reading that matches what they typed.
 */
export function asInstant(value: FieldValue | undefined): string | null {
  const text = asString(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The reverse, for prefilling a `datetime-local` from a stored instant. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // `toISOString` would render UTC and shift the displayed time. Building it from
  // the local getters is what makes the field show the instant in the operator's
  // own zone, which is the one they set it in.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
