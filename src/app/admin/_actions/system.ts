'use server'

import { revalidatePath } from 'next/cache'

import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  type RecordValues,
} from '@/components/admin/form-spec'
import { audit } from '@/lib/admin/audit'
import { withCapability, type AdminResult } from '@/lib/admin/guard'
import { getModel } from '@/lib/ai/registry'
import { isConnectableProvider } from '@/lib/ai/catalogue'
import { FLAG_DEFAULTS, type FlagKey } from '@/lib/flags'
import { cmsToggle } from '@/services/cms/crud'
import { resolveMediaUrls } from '@/services/cms/media.service'
import { writeSettings, type SettingWrite } from '@/services/cms/settings.service'
import type { Json } from '@/types/database'

/**
 * Settings, branding, theme and feature flags.
 *
 * A settings write is a batch, not a field at a time. Three reasons: an operator
 * pressing Save on a panel of eight fields expects one save, the audit trail should
 * record one change rather than eight, and a partial failure halfway through eight
 * round trips leaves the panel in a state nobody asked for.
 *
 * `revalidatePath('/', 'layout')` is the blunt instrument used for branding and
 * theme, and it is the right one: those values are injected into the root layout, so
 * every route in the app renders them. Revalidating a page would leave the old
 * colours on every other one.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Saves a batch and audits the difference.
 *
 * `writeSettings` returns the previous values, which is what makes the audit row
 * useful — "changed the prompt limit" is not the same as "changed it from 1200 to
 * 20", and the second is the one somebody will want at 3am.
 */
async function save(
  writes: SettingWrite[],
  actorAndMeta: {
    actorId: string
    audit: Parameters<typeof audit>[0]
  },
): Promise<AdminResult<null>> {
  const result = await writeSettings(writes, actorAndMeta.actorId)
  if (!result.ok) return { ok: false, error: result.error }

  const after: Record<string, Json> = {}
  for (const write of writes) after[write.key] = write.value

  await audit({ ...actorAndMeta.audit, before: result.before, after })
  return { ok: true, data: null }
}

export async function saveSiteSettings(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const name = asString(values['site.name'])
    if (!name) return { ok: false, error: 'The site needs a name.', field: 'site.name' }

    const writes: SettingWrite[] = [
      { key: 'site.name', value: name },
      { key: 'site.short_name', value: asString(values['site.short_name'], name) },
      { key: 'site.tagline', value: asString(values['site.tagline']) },
      { key: 'site.description', value: asString(values['site.description']) },
      { key: 'site.support_email', value: asString(values['site.support_email']) || null },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'settings',
        entityId: 'site',
        summary: `Updated the site settings — name is now “${name}”`,
      },
    })
    if (!result.ok) return result

    revalidatePath('/', 'layout')
    revalidatePath('/admin/settings')
    return { ok: true, data: null }
  })
}

export async function saveSeoSettings(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const template = asString(values['seo.title_template'])
    // Next.js substitutes `%s` with the page title. A template without it silently
    // gives every page the same name, which is the worst possible SEO outcome and is
    // invisible until somebody checks a tab.
    if (template && !template.includes('%s')) {
      return {
        ok: false,
        error: 'The template needs %s, which is where the page name goes.',
        field: 'seo.title_template',
      }
    }

    const writes: SettingWrite[] = [
      { key: 'seo.title_template', value: template },
      { key: 'seo.default_title', value: asString(values['seo.default_title']) },
      { key: 'seo.keywords', value: asStringArray(values['seo.keywords']) },
      { key: 'seo.og_image_url', value: asString(values['seo.og_image_url']) || null },
      { key: 'seo.twitter_handle', value: asString(values['seo.twitter_handle']) || null },
      { key: 'seo.robots_index', value: asBoolean(values['seo.robots_index'], true) },
    ]

    const indexed = asBoolean(values['seo.robots_index'], true)

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'settings',
        entityId: 'seo',
        summary: `Updated SEO — indexing is ${indexed ? 'allowed' : 'DISALLOWED for the whole site'}`,
      },
    })
    if (!result.ok) return result

    revalidatePath('/', 'layout')
    revalidatePath('/robots.txt')
    revalidatePath('/admin/settings')
    return { ok: true, data: null }
  })
}

export async function saveGenerationSettings(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const imageModel = asString(values['generation.default_image_model'])
    const videoModel = asString(values['generation.default_video_model'])
    const provider = asString(values['generation.default_provider'])

    // A default that is not in the registry is a composer that opens on a model
    // nobody can run. Checked here because the registry is code and no constraint
    // can see it.
    if (imageModel && !getModel(imageModel)) {
      return {
        ok: false,
        error: 'That model is not in the registry.',
        field: 'generation.default_image_model',
      }
    }
    if (videoModel && !getModel(videoModel)) {
      return {
        ok: false,
        error: 'That model is not in the registry.',
        field: 'generation.default_video_model',
      }
    }
    if (provider && !isConnectableProvider(provider)) {
      return {
        ok: false,
        error: 'That is not a vendor this build knows about.',
        field: 'generation.default_provider',
      }
    }

    const writes: SettingWrite[] = [
      { key: 'generation.default_task', value: asString(values['generation.default_task'], 'text_to_image') },
      { key: 'generation.default_image_model', value: imageModel },
      { key: 'generation.default_video_model', value: videoModel },
      { key: 'generation.default_provider', value: provider || null },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'settings',
        entityId: 'generation',
        summary: `Generation defaults: ${imageModel} for stills, ${videoModel} for video`,
      },
    })
    if (!result.ok) return result

    revalidatePath('/admin/settings')
    revalidatePath('/create')
    return { ok: true, data: null }
  })
}

export async function saveLimitSettings(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const promptLength = asNumber(values['limits.max_prompt_length'], 1200)
    const uploadMb = asNumber(values['limits.max_upload_mb'], 10)
    const timeout = asNumber(values['limits.job_timeout_minutes'], 6)

    if (promptLength < 50 || promptLength > 20000) {
      return { ok: false, error: 'Between 50 and 20,000 characters.', field: 'limits.max_prompt_length' }
    }
    // The `uploads` bucket has its own 10MB file_size_limit (migration 0004), so a
    // larger number here would produce an upload the app accepts and storage refuses.
    if (uploadMb < 1 || uploadMb > 10) {
      return {
        ok: false,
        error: 'Between 1 and 10MB — the storage bucket enforces 10MB of its own.',
        field: 'limits.max_upload_mb',
      }
    }
    if (timeout < 1 || timeout > 60) {
      return { ok: false, error: 'Between 1 and 60 minutes.', field: 'limits.job_timeout_minutes' }
    }

    const writes: SettingWrite[] = [
      { key: 'limits.max_prompt_length', value: promptLength },
      { key: 'limits.max_upload_mb', value: uploadMb },
      { key: 'limits.job_timeout_minutes', value: timeout },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'settings',
        entityId: 'limits',
        summary: `Limits: ${promptLength} chars, ${uploadMb}MB uploads, ${timeout}min timeout`,
      },
    })
    if (!result.ok) return result

    revalidatePath('/admin/settings')
    return { ok: true, data: null }
  })
}

export async function saveLegalSettings(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const disclaimer = asString(values['legal.billing_disclaimer'])
    // Refused rather than defaulted: this build's checkout is simulated, and a
    // pricing page that stops saying so is a pricing page that is lying. An operator
    // who connects a real payment provider changes the text; they do not empty it.
    if (!disclaimer) {
      return {
        ok: false,
        error:
          'The billing disclaimer cannot be empty while checkout is simulated — the pricing page would be misleading without it.',
        field: 'legal.billing_disclaimer',
      }
    }

    const writes: SettingWrite[] = [
      { key: 'legal.copyright', value: asString(values['legal.copyright']) },
      { key: 'legal.billing_disclaimer', value: disclaimer },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'settings',
        entityId: 'legal',
        summary: 'Updated the legal copy',
      },
    })
    if (!result.ok) return result

    revalidatePath('/', 'layout')
    revalidatePath('/admin/settings')
    return { ok: true, data: null }
  })
}

export async function saveStorageSettings(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const writes: SettingWrite[] = [
      { key: 'storage.provider', value: asString(values['storage.provider'], 'supabase') },
      { key: 'storage.uploads_bucket', value: asString(values['storage.uploads_bucket'], 'uploads') },
      { key: 'storage.media_bucket', value: asString(values['storage.media_bucket'], 'generations') },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'settings',
        entityId: 'storage',
        summary: 'Updated the storage settings',
      },
    })
    if (!result.ok) return result

    revalidatePath('/admin/settings')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export async function saveBranding(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    /*
     * The library picker wins over the URL field.
     *
     * Two inputs for one value needs a rule, and this is the one that matches what an
     * operator means: picking a thumbnail is a deliberate, specific act, where a URL left in
     * the text field is usually the previous value nobody cleared. The id is resolved to its
     * URL here rather than stored as an id, so the header needs no extra lookup on every
     * render — and a logo deleted from the library leaves a broken image rather than a
     * missing one, which is the more obvious failure to notice and fix.
     */
    const pickedId = asString(values['branding.logo_media'])
    let logo = asString(values['branding.logo_url'])

    if (pickedId) {
      const resolved = await resolveMediaUrls([pickedId])
      const url = resolved.get(pickedId)
      if (!url) {
        return {
          ok: false,
          error: 'That image is no longer in the library.',
          field: 'branding.logo_media',
        }
      }
      logo = url
    }

    const favicon = asString(values['branding.favicon_url'])

    // Both are rendered as an `src`, so a relative or `javascript:` value would be at
    // best broken and at worst a link somebody clicks. https only.
    for (const [key, value] of [
      ['branding.logo_url', logo],
      ['branding.favicon_url', favicon],
    ] as const) {
      if (value && !/^https:\/\//i.test(value)) {
        return { ok: false, error: 'Use an https:// URL, or pick from the media library.', field: key }
      }
    }

    const writes: SettingWrite[] = [
      { key: 'branding.logo_url', value: logo || null },
      { key: 'branding.favicon_url', value: favicon || null },
      { key: 'branding.wordmark_text', value: asString(values['branding.wordmark_text']) },
      { key: 'branding.show_wordmark', value: asBoolean(values['branding.show_wordmark'], true) },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'branding',
        entityId: 'branding',
        summary: `Updated branding${logo ? ' with a custom logo' : ''}`,
      },
    })
    if (!result.ok) return result

    revalidatePath('/', 'layout')
    revalidatePath('/admin/branding')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * A CSS colour value the theme injector can safely put in a `<style>` block.
 *
 * This is the one piece of validation in the panel that is a security control rather
 * than a usability one. The values are interpolated into a stylesheet, so a value
 * containing `;` or `}` could close the rule and open another — and a CSS injection
 * on every page of the site is worth more care than a regex somebody waved at.
 *
 * The allow-list is narrow on purpose: `oklch()`, `rgb()`, `hsl()`, a hex triple, or
 * a bare CSS keyword. No `url()`, no `var()`, no nesting.
 */
const COLOUR_PATTERN =
  /^(#[0-9a-f]{3,8}|(oklch|rgb|rgba|hsl|hsla)\([0-9a-z.,%/ \-+]*\)|[a-z]{3,20})$/i

function checkColour(value: string, field: string): { error: string; field: string } | null {
  if (!value) return { field, error: 'A colour is required.' }
  if (value.length > 64) return { field, error: 'That is too long to be a colour value.' }
  if (!COLOUR_PATTERN.test(value)) {
    return {
      field,
      error: 'Use a value like oklch(0.8 0.135 200), #22d3ee or rgb(34 211 238).',
    }
  }
  return null
}

export async function saveTheme(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('settings:write', async (actor) => {
    const colours: [string, string][] = [
      ['theme.color_primary', asString(values['theme.color_primary'])],
      ['theme.color_accent', asString(values['theme.color_accent'])],
      ['theme.color_background', asString(values['theme.color_background'])],
      ['theme.color_surface', asString(values['theme.color_surface'])],
      ['theme.color_credit', asString(values['theme.color_credit'])],
    ]

    for (const [key, value] of colours) {
      const bad = checkColour(value, key)
      if (bad) return { ok: false, ...bad }
    }

    const radius = asString(values['theme.radius'])
    // Same reasoning as the colours: this lands in a stylesheet.
    if (!/^[0-9.]+(rem|px|em)$/.test(radius)) {
      return { ok: false, error: 'Use a length like 0.625rem or 10px.', field: 'theme.radius' }
    }

    const writes: SettingWrite[] = [
      ...colours.map(([key, value]) => ({ key, value })),
      { key: 'theme.radius', value: radius },
      { key: 'theme.font_sans', value: asString(values['theme.font_sans'], 'Inter') },
      { key: 'theme.font_display', value: asString(values['theme.font_display'], 'Space Grotesk') },
      { key: 'theme.mode', value: asString(values['theme.mode'], 'dark') },
      { key: 'theme.animations', value: asBoolean(values['theme.animations'], true) },
    ]

    const result = await save(writes, {
      actorId: actor.id,
      audit: {
        actor,
        action: 'update',
        entity: 'theme',
        entityId: 'theme',
        summary: 'Updated the theme tokens',
      },
    })
    if (!result.ok) return result

    revalidatePath('/', 'layout')
    revalidatePath('/admin/theme')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/**
 * Flips a flag.
 *
 * Behind its own `flags:write` capability rather than `settings:write`, because
 * `maintenance_mode` takes the studio offline for everybody who is not staff. That is
 * a different kind of action from renaming the site, and it deserves a grant of its
 * own.
 *
 * The audit summary spells out the consequence for the two that have one, because
 * six months later "disabled generation" will be the only record of why nobody could
 * render anything that afternoon.
 */
export async function setFlag(key: string, enabled: boolean): Promise<AdminResult<null>> {
  return withCapability('flags:write', async (actor) => {
    if (!Object.hasOwn(FLAG_DEFAULTS, key)) {
      return { ok: false, error: 'This build does not have a flag with that key.' }
    }

    const consequence: Partial<Record<FlagKey, string>> = {
      maintenance_mode: enabled
        ? ' — the studio now shows a maintenance notice to everyone except staff'
        : ' — the studio is open again',
      generation: enabled ? '' : ' — new generations are refused; running jobs still finish',
      registration: enabled ? '' : ' — signup is closed',
    }

    const result = await cmsToggle('feature_flags', 'key', key, 'enabled', enabled, {
      actor,
      entity: 'feature_flag',
      summary: `${enabled ? 'Enabled' : 'Disabled'} ${key}${consequence[key as FlagKey] ?? ''}`,
    })

    if (!result.ok) return result

    // A flag can gate any surface, so the whole tree is stale.
    revalidatePath('/', 'layout')
    revalidatePath('/admin/flags')
    return { ok: true, data: null }
  })
}
