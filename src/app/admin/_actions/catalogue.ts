'use server'

import { revalidatePath } from 'next/cache'

import {
  asBoolean,
  asNullableString,
  asNumber,
  asString,
  asStringArray,
  type RecordValues,
} from '@/components/admin/form-spec'
import { withCapability, type AdminActor, type AdminResult } from '@/lib/admin/guard'
import { getProvider, isConnectableProvider } from '@/lib/ai/catalogue'
import { getModel, primaryProvider } from '@/lib/ai/registry'
import { cmsCreate, cmsGet, cmsReorder, cmsToggle, cmsUpdate } from '@/services/cms/crud'
import {
  createPreset,
  deletePreset,
  setPresetActive,
  setPresetFeatured,
  updatePreset,
} from '@/services/admin/presets.service'
import {
  deleteAppProviderKey,
  saveAppProviderKey,
  testAppProviderKey,
} from '@/services/cms/provider-keys.service'
import type { PresetKind } from '@/types/database'

/**
 * Providers, models, provider keys and prompt presets.
 *
 * The boundary drawn in services/cms/catalogue.service.ts is enforced here: these
 * actions write what a visitor is TOLD about a model or a vendor, never what one IS.
 * There is no action in this file that can change a credit price, a provider route
 * or whether a driver exists — those are code, and a CMS form that could reprice a
 * render is a way to lose money.
 *
 * The key actions are the only ones in the panel behind `secrets:write`, which only
 * `super_admin` holds. Rotating a shared vendor key is the one thing in here that
 * spends money on somebody else's account.
 */

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export async function updateProvider(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    if (!isConnectableProvider(id)) {
      return { ok: false, error: 'That is not a provider this build knows about.' }
    }

    const label = asString(values.label)
    if (!label) return { ok: false, error: 'Give the provider a name.', field: 'label' }

    const minLength = asNumber(values.key_min_length, 16)
    if (minLength < 4 || minLength > 512) {
      return { ok: false, error: 'A sensible minimum is between 4 and 512.', field: 'key_min_length' }
    }

    // A pattern that does not compile would throw inside `keyShapeWarning` on the
    // settings page, for every user, on every render. Compiling it here is the
    // cheapest possible test.
    const pattern = asNullableString(values.key_pattern)
    if (pattern) {
      try {
        new RegExp(pattern)
      } catch {
        return { ok: false, error: 'That is not a valid regular expression.', field: 'key_pattern' }
      }
    }

    const result = await cmsUpdate(
      'ai_providers',
      'id',
      id,
      {
        label,
        description: asString(values.description),
        logo_url: asNullableString(values.logo_url),
        logo_media_id: asNullableString(values.logo_media_id),
        media: asString(values.media, 'both') as never,
        console_url: asNullableString(values.console_url),
        docs_url: asNullableString(values.docs_url),
        key_placeholder: asString(values.key_placeholder),
        key_min_length: minLength,
        key_pattern: pattern,
        is_recommended: asBoolean(values.is_recommended, false),
        status: asString(values.status, 'active') as never,
        // `generation_ready` is deliberately absent. It is derived from the code —
        // whether a driver exists and a model routes to the vendor — and a switch
        // claiming otherwise would produce jobs that fail and refund. The form shows
        // it read-only.
        updated_by: actor.id,
      },
      { actor, entity: 'ai_provider', summary: `Edited the ${label} provider entry` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidatePath('/admin/providers')
    revalidatePath('/settings/keys')
    revalidatePath('/')
    return { ok: true, data: null }
  })
}

export async function setProviderEnabled(id: string, enabled: boolean): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    const label = getProvider(id)?.label ?? id
    const result = await cmsToggle('ai_providers', 'id', id, 'is_enabled', enabled, {
      actor,
      entity: 'ai_provider',
      summary: `${enabled ? 'Enabled' : 'Disabled'} ${label} — ${enabled ? 'users can connect a key' : 'the connect row is hidden; stored keys keep working'}`,
    })
    if (!result.ok) return result
    revalidatePath('/admin/providers')
    revalidatePath('/settings/keys')
    return { ok: true, data: null }
  })
}

export async function reorderProviders(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    const result = await cmsReorder('ai_providers', 'id', ids, {
      actor,
      entity: 'ai_provider',
      summary: 'Reordered the provider list',
    })
    if (!result.ok) return result
    revalidatePath('/admin/providers')
    revalidatePath('/settings/keys')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Provider keys — super_admin only
// ---------------------------------------------------------------------------

export async function saveProviderKey(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('secrets:write', async (actor) => {
    const provider = asString(values.provider)
    const apiKey = asString(values.apiKey)

    if (!isConnectableProvider(provider)) {
      return { ok: false, error: 'Pick a provider.', field: 'provider' }
    }
    if (!apiKey) return { ok: false, error: 'Paste the key.', field: 'apiKey' }

    const result = await saveAppProviderKey(
      { provider, apiKey, label: asNullableString(values.label) },
      actor,
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidatePath('/admin/providers/keys')
    return { ok: true, data: null }
  })
}

/**
 * The same save, with the provider fixed by the caller.
 *
 * The per-row Rotate button knows which vendor it is for, and a Server Action cannot be
 * partially applied with an inline closure — a closure is not serialisable across the
 * client boundary. Binding this one's first argument is what lets each row have its own
 * rotate dialog without a provider dropdown in it.
 */
export async function saveProviderKeyFor(
  provider: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return saveProviderKey({ ...values, provider })
}

export async function testProviderKey(provider: string): Promise<AdminResult<null>> {
  return withCapability('secrets:write', async (actor) => {
    const result = await testAppProviderKey(provider, actor)
    if (!result.ok) return { ok: false, error: result.error }
    revalidatePath('/admin/providers/keys')
    return { ok: true, data: null }
  })
}

export async function removeProviderKey(provider: string): Promise<AdminResult<null>> {
  return withCapability('secrets:write', async (actor) => {
    const result = await deleteAppProviderKey(provider, actor)
    if (!result.ok) return { ok: false, error: result.error }
    revalidatePath('/admin/providers/keys')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * Makes sure `ai_models` has a row for this registry id.
 *
 * `getModelViews` is driven by the registry and merges a row onto each entry when one
 * exists, so a model added to the code renders correctly with no row at all — which is
 * the right default and the reason the admin screen shows it as "not described".
 *
 * But an update or a toggle needs something to write to. Rather than make every action
 * branch on whether a row exists, this seeds one from the registry the first time
 * anybody touches the model. The seeded values are exactly what the merge was already
 * showing, so creating it changes nothing a visitor can see.
 */
async function ensureModelRow(id: string, actor: AdminActor): Promise<boolean> {
  const entry = getModel(id)
  if (!entry) return false

  const existing = await cmsGet('ai_models', 'id', id)
  if (existing) return true

  const result = await cmsCreate(
    'ai_models',
    {
      id,
      label: entry.label,
      provider_id: primaryProvider(entry),
      description: entry.blurb,
      basis: entry.family,
      category: entry.task === 'text_to_image' ? 'image' : 'video',
      capabilities: [entry.task],
      input_types: entry.supports.imageInput ? ['text', 'image'] : ['text'],
      output_types: [entry.task === 'text_to_image' ? 'image' : 'video'],
      is_recommended: Boolean(entry.featured),
      is_featured: Boolean(entry.featured),
      show_on_landing: true,
      status: 'active',
      sort_order: 999,
      updated_by: actor.id,
    },
    {
      actor,
      entity: 'ai_model',
      summary: `Started describing ${entry.label} — seeded from the registry`,
    },
  )

  return result.ok
}

export async function updateModel(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    // The id has to be a registry model. A row for anything else would merge onto
    // nothing and never render — see `getModelViews`, which is driven by `MODELS`.
    if (!getModel(id)) {
      return { ok: false, error: 'That model is not in the registry, so it cannot be described.' }
    }
    if (!(await ensureModelRow(id, actor))) {
      return { ok: false, error: 'Could not create a row for that model.' }
    }

    const label = asString(values.label)
    if (!label) return { ok: false, error: 'Give the model a display name.', field: 'label' }

    const providerId = asNullableString(values.provider_id)
    if (providerId && !isConnectableProvider(providerId)) {
      return { ok: false, error: 'That is not a vendor this build knows about.', field: 'provider_id' }
    }

    const result = await cmsUpdate(
      'ai_models',
      'id',
      id,
      {
        label,
        provider_id: providerId,
        description: asString(values.description),
        basis: asNullableString(values.basis),
        use_case: asNullableString(values.use_case),
        image_url: asNullableString(values.image_url),
        media_id: asNullableString(values.media_id),
        category: asNullableString(values.category),
        tags: asStringArray(values.tags),
        capabilities: asStringArray(values.capabilities),
        input_types: asStringArray(values.input_types),
        output_types: asStringArray(values.output_types),
        is_recommended: asBoolean(values.is_recommended, false),
        is_featured: asBoolean(values.is_featured, false),
        show_on_landing: asBoolean(values.show_on_landing, true),
        status: asString(values.status, 'active') as never,
        updated_by: actor.id,
      },
      { actor, entity: 'ai_model', summary: `Edited how ${label} is presented` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidatePath('/admin/models')
    revalidatePath('/')
    return { ok: true, data: null }
  })
}

export async function setModelOnLanding(id: string, show: boolean): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    if (!(await ensureModelRow(id, actor))) {
      return { ok: false, error: 'That model is not in the registry.' }
    }

    const result = await cmsToggle('ai_models', 'id', id, 'show_on_landing', show, {
      actor,
      entity: 'ai_model',
      summary: `${show ? 'Listed' : 'Removed'} ${id} ${show ? 'on' : 'from'} the landing page`,
    })
    if (!result.ok) return result
    revalidatePath('/admin/models')
    revalidatePath('/')
    return { ok: true, data: null }
  })
}

export async function setModelFeatured(id: string, featured: boolean): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    if (!(await ensureModelRow(id, actor))) {
      return { ok: false, error: 'That model is not in the registry.' }
    }

    const result = await cmsToggle('ai_models', 'id', id, 'is_featured', featured, {
      actor,
      entity: 'ai_model',
      summary: `${featured ? 'Featured' : 'Unfeatured'} ${id}`,
    })
    if (!result.ok) return result
    revalidatePath('/admin/models')
    revalidatePath('/')
    return { ok: true, data: null }
  })
}

export async function reorderModels(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('providers:write', async (actor) => {
    const result = await cmsReorder('ai_models', 'id', ids, {
      actor,
      entity: 'ai_model',
      summary: 'Reordered the model roster',
    })
    if (!result.ok) return result
    revalidatePath('/admin/models')
    revalidatePath('/')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Prompt presets
// ---------------------------------------------------------------------------

/**
 * A preset's fields, from the form.
 *
 * `params` is deliberately absent from the admin form. It is model-specific
 * inference configuration — step counts, guidance scales, frame rates — and a wrong
 * value there produces a 422 from the provider that the user is charged for. It is
 * edited by the seed script, which has the model's schema in front of it.
 */
function presetInput(values: RecordValues) {
  return {
    slug: asString(values.slug),
    title: asString(values.title),
    description: asNullableString(values.description),
    kind: asString(values.kind, 'motion') as PresetKind,
    category: asString(values.category),
    promptFragment: asString(values.prompt_fragment),
    negativePrompt: asNullableString(values.negative_prompt),
    modelId: asString(values.model_id),
    previewVideoUrl: asNullableString(values.preview_video_url),
    previewPosterUrl: asNullableString(values.preview_poster_url),
    accent: asNullableString(values.accent),
    creditCost: asNumber(values.credit_cost, 0),
    sortOrder: asNumber(values.sort_order, 999),
    isFeatured: asBoolean(values.is_featured, false),
    isActive: asBoolean(values.is_active, true),
  }
}

export async function addPreset(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await createPreset(presetInput(values), actor)
    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidatePath('/admin/presets')
    revalidatePath('/presets')
    revalidatePath('/create')
    return { ok: true, data: null }
  })
}

export async function editPreset(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await updatePreset(id, presetInput(values), actor)
    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidatePath('/admin/presets')
    revalidatePath('/presets')
    revalidatePath('/create')
    return { ok: true, data: null }
  })
}

export async function togglePresetActive(id: string, active: boolean): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await setPresetActive(id, active, actor)
    if (!result.ok) return result
    revalidatePath('/admin/presets')
    revalidatePath('/presets')
    revalidatePath('/create')
    return { ok: true, data: null }
  })
}

export async function togglePresetFeatured(
  id: string,
  featured: boolean,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await setPresetFeatured(id, featured, actor)
    if (!result.ok) return result
    revalidatePath('/admin/presets')
    revalidatePath('/presets')
    return { ok: true, data: null }
  })
}

export async function removePreset(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await deletePreset(id, actor)
    if (!result.ok) return result
    revalidatePath('/admin/presets')
    revalidatePath('/presets')
    return { ok: true, data: null }
  })
}
