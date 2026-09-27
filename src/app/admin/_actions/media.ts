'use server'

import { revalidatePath } from 'next/cache'

import {
  asBoolean,
  asNullableString,
  asString,
  asStringArray,
  type RecordValues,
} from '@/components/admin/form-spec'
import { withCapability, type AdminResult } from '@/lib/admin/guard'
import {
  deleteMedia,
  linkMedia,
  replaceMedia,
  updateMedia,
  uploadMedia,
} from '@/services/cms/media.service'
import type { MediaCategory } from '@/types/database'

/**
 * Media library actions.
 *
 * The two upload actions take `FormData` rather than a values object, because a File
 * cannot be serialised into one — a Server Action can receive a `FormData` containing
 * a file directly, and anything else would mean base64 in a JSON payload.
 *
 * Every mutation revalidates the whole layout. Media is referenced from the landing
 * bands, the branding settings, the model cards and the testimonials, and the id-based
 * references mean a replaced image changes what renders on pages this action has no
 * way to enumerate.
 */

const CATEGORIES: MediaCategory[] = [
  'landscape',
  'person',
  'animal',
  'urban',
  'abstract',
  'still_life',
  'brand',
  'ui',
  'other',
]

function isCategory(value: string): value is MediaCategory {
  return (CATEGORIES as string[]).includes(value)
}

function revalidateMedia() {
  revalidatePath('/admin/media')
  // Media is referenced by id from bands, branding, models and testimonials, so the
  // set of affected pages is not knowable from here.
  revalidatePath('/', 'layout')
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function uploadMediaFile(form: FormData): Promise<AdminResult<null>> {
  return withCapability('media:write', async (actor) => {
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a file.', field: 'file' }
    }

    const category = String(form.get('category') ?? 'other')
    if (!isCategory(category)) {
      return { ok: false, error: 'Pick a category.', field: 'category' }
    }

    const result = await uploadMedia(
      {
        file,
        title: String(form.get('title') ?? '').trim() || null,
        alt: String(form.get('alt') ?? ''),
        category,
        folder: String(form.get('folder') ?? 'library'),
        creditName: String(form.get('creditName') ?? '').trim() || null,
        creditUrl: String(form.get('creditUrl') ?? '').trim() || null,
        tags: String(form.get('tags') ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      actor,
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateMedia()
    return { ok: true, data: null }
  })
}

/**
 * Registers an image somebody else hosts.
 *
 * The original purpose of `media_assets` and still useful: reference photography is
 * hosted by whoever took it, and storing a URL rather than bytes keeps this table a
 * catalogue.
 */
export async function linkMediaUrl(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('media:write', async (actor) => {
    const category = asString(values.category, 'other')
    if (!isCategory(category)) {
      return { ok: false, error: 'Pick a category.', field: 'category' }
    }

    const result = await linkMedia(
      {
        url: asString(values.url),
        slug: asString(values.slug),
        title: asNullableString(values.title),
        alt: asString(values.alt),
        category,
        folder: asString(values.folder, 'library'),
        creditName: asNullableString(values.credit_name),
        creditUrl: asNullableString(values.credit_url),
        tags: asStringArray(values.tags),
      },
      actor,
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateMedia()
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function editMedia(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('media:write', async (actor) => {
    const alt = asString(values.alt)
    if (!alt) {
      return {
        ok: false,
        error: 'Alt text is required — describe what is in the frame.',
        field: 'alt',
      }
    }

    const category = asString(values.category, 'other')
    if (!isCategory(category)) {
      return { ok: false, error: 'Pick a category.', field: 'category' }
    }

    const result = await updateMedia(
      id,
      {
        title: asNullableString(values.title),
        alt,
        category,
        folder: asString(values.folder, 'library'),
        creditName: asNullableString(values.credit_name),
        creditUrl: asNullableString(values.credit_url),
        tags: asStringArray(values.tags),
        isActive: asBoolean(values.is_active, true),
      },
      actor,
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateMedia()
    return { ok: true, data: null }
  })
}

/**
 * Swaps the file behind an entry, keeping its id.
 *
 * The id is what every CMS row references, so replacing a logo must not mean
 * re-pointing every reference at a new row — which is what deleting and re-uploading
 * would require.
 */
export async function replaceMediaFile(form: FormData): Promise<AdminResult<null>> {
  return withCapability('media:write', async (actor) => {
    const id = String(form.get('id') ?? '')
    const file = form.get('file')

    if (!id) return { ok: false, error: 'Which image?' }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a replacement file.', field: 'file' }
    }

    const result = await replaceMedia(id, file, actor)
    if (!result.ok) return { ok: false, error: result.error, field: result.field }

    revalidateMedia()
    return { ok: true, data: null }
  })
}

export async function setMediaActive(id: string, active: boolean): Promise<AdminResult<null>> {
  return withCapability('media:write', async (actor) => {
    const result = await updateMedia(id, { isActive: active }, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateMedia()
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function removeMedia(id: string): Promise<AdminResult<null>> {
  return withCapability('media:write', async (actor) => {
    const result = await deleteMedia(id, actor)
    if (!result.ok) return { ok: false, error: result.error }

    revalidateMedia()
    return { ok: true, data: null }
  })
}
