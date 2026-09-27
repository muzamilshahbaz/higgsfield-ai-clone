'use server'

import { revalidatePath } from 'next/cache'

import {
  asBoolean,
  asInstant,
  asJson,
  asNullableString,
  asNumber,
  asString,
  type RecordValues,
} from '@/components/admin/form-spec'
import { FEATURE_SPAN_VALUES, isIconName } from '@/lib/admin/icons'
import { withCapability, type AdminResult } from '@/lib/admin/guard'
import { KNOWN_SECTIONS } from '@/lib/cms/content'
import { cmsCreate, cmsDelete, cmsReorder, cmsToggle, cmsUpdate } from '@/services/cms/crud'

/**
 * Landing-page and content Server Actions.
 *
 * Every one of them is `withCapability('content:write', …)`, which is not a
 * formality: a Server Action is an HTTP endpoint reachable by anyone who can guess
 * its id, so the guard in the layout does not protect it and the capability check
 * has to be the first thing that runs. `withCapability` takes the capability as an
 * argument to the thing that runs the body, so an action cannot be written that
 * forgets it.
 *
 * Every mutation is audited, and that is structural too — it happens inside
 * services/cms/crud.ts, so there is no path through these actions that writes
 * without a trail.
 *
 * `revalidatePath` covers both surfaces: the admin screen the operator is on, and
 * the public page the change is visible on. Missing the second is the bug that makes
 * a CMS feel broken — the edit saved, the homepage did not move, and the operator
 * saves again.
 */

/** The pages a content change is visible on. */
function revalidateContent(adminPath: string) {
  revalidatePath(adminPath)
  revalidatePath('/')
  // The header and footer are database-driven and rendered on these too.
  revalidatePath('/explore')
}

// ---------------------------------------------------------------------------
// Landing sections
// ---------------------------------------------------------------------------

/**
 * Updates one band's copy.
 *
 * The key is validated against `KNOWN_SECTIONS` rather than trusted, because an
 * action that accepts any key would let somebody create rows the page cannot render
 * — and the rest of the form would happily write them.
 */
export async function updateLandingSection(
  key: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    if (!(KNOWN_SECTIONS as readonly string[]).includes(key)) {
      return { ok: false, error: 'This build does not have a section with that key.' }
    }

    const config = asJson(values.config)
    if (!config.ok) {
      return { ok: false, error: 'The advanced settings are not valid JSON.', field: 'config' }
    }
    if (config.data === null || typeof config.data !== 'object' || Array.isArray(config.data)) {
      return {
        ok: false,
        error: 'The advanced settings have to be a JSON object, like {"tinted": true}.',
        field: 'config',
      }
    }

    const result = await cmsUpdate(
      'landing_sections',
      'key',
      key,
      {
        index_label: asNullableString(values.index_label),
        eyebrow: asNullableString(values.eyebrow),
        title: asNullableString(values.title),
        lead: asNullableString(values.lead),
        body: asNullableString(values.body),
        cta_label: asNullableString(values.cta_label),
        cta_href: asNullableString(values.cta_href),
        media_id: asNullableString(values.media_id),
        config: config.data as never,
        updated_by: actor.id,
      },
      { actor, entity: 'landing_section', summary: `Edited the “${key}” band` },
    )

    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function setSectionVisible(key: string, visible: boolean): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('landing_sections', 'key', key, 'is_visible', visible, {
      actor,
      entity: 'landing_section',
      summary: `${visible ? 'Showed' : 'Hid'} the “${key}” band`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function reorderSections(keys: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('landing_sections', 'key', keys, {
      actor,
      entity: 'landing_section',
      summary: 'Reordered the landing bands',
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/**
 * Validates the two fields that would otherwise fail silently.
 *
 * A `span` Tailwind has not generated is a class with no CSS behind it — the card
 * renders at the wrong width and nothing errors. An `icon` outside the allow-list
 * renders the fallback mark, which looks like a design decision rather than a typo.
 * Both are worth a sentence under the field.
 */
function checkFeatureFields(values: RecordValues): { error: string; field: string } | null {
  const span = asString(values.span)
  if (span && !FEATURE_SPAN_VALUES.includes(span)) {
    return { field: 'span', error: 'Pick one of the listed widths.' }
  }
  const icon = asString(values.icon)
  if (icon && !isIconName(icon)) {
    return { field: 'icon', error: 'Pick an icon from the list.' }
  }
  return null
}

export async function createFeature(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const bad = checkFeatureFields(values)
    if (bad) return { ok: false, ...bad }

    const title = asString(values.title)
    if (!title) return { ok: false, error: 'Give the card a title.', field: 'title' }

    const result = await cmsCreate(
      'site_features',
      {
        placement: asString(values.placement, 'features') as never,
        title,
        body: asString(values.body),
        detail: asNullableString(values.detail),
        icon: asNullableString(values.icon),
        span: asNullableString(values.span),
        href: asNullableString(values.href),
        media_id: asNullableString(values.media_id),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'site_feature', summary: `Added the card “${title}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/features')
    return { ok: true, data: null }
  })
}

export async function updateFeature(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const bad = checkFeatureFields(values)
    if (bad) return { ok: false, ...bad }

    const title = asString(values.title)
    if (!title) return { ok: false, error: 'Give the card a title.', field: 'title' }

    const result = await cmsUpdate(
      'site_features',
      'id',
      id,
      {
        placement: asString(values.placement, 'features') as never,
        title,
        body: asString(values.body),
        detail: asNullableString(values.detail),
        icon: asNullableString(values.icon),
        span: asNullableString(values.span),
        href: asNullableString(values.href),
        media_id: asNullableString(values.media_id),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'site_feature', summary: `Edited the card “${title}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/features')
    return { ok: true, data: null }
  })
}

export async function setFeatureVisible(id: string, visible: boolean): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('site_features', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'site_feature',
      summary: `${visible ? 'Showed' : 'Hid'} a feature card`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/features')
    return { ok: true, data: null }
  })
}

export async function deleteFeature(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('site_features', 'id', id, {
      actor,
      entity: 'site_feature',
      summary: 'Deleted a feature card',
    })
    if (!result.ok) return result
    revalidateContent('/admin/features')
    return { ok: true, data: null }
  })
}

export async function reorderFeatures(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('site_features', 'id', ids, {
      actor,
      entity: 'site_feature',
      summary: 'Reordered the feature cards',
    })
    if (!result.ok) return result
    revalidateContent('/admin/features')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

const STAT_KINDS = [
  'literal',
  'models',
  'presets',
  'providers',
  'signup_credits',
  'creators',
  'projects',
  'assets',
  'countries',
  'public_generations',
]

/**
 * The one rule a stat has to satisfy: a literal needs something to print.
 *
 * `site_stats_literal_present` enforces it in Postgres, so this check is only
 * about the error message — a constraint name in a toast tells an operator nothing
 * about which field is empty.
 */
function checkStat(values: RecordValues): { error: string; field: string } | null {
  const kind = asString(values.value_kind, 'literal')
  if (!STAT_KINDS.includes(kind)) {
    return { field: 'value_kind', error: 'Pick one of the listed sources.' }
  }
  if (kind === 'literal' && !asString(values.literal_value)) {
    return {
      field: 'literal_value',
      error: 'A fixed stat needs a value. Choose a counted source instead to have it computed.',
    }
  }
  return null
}

export async function createStat(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const bad = checkStat(values)
    if (bad) return { ok: false, ...bad }

    const key = asString(values.key)
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) {
      return {
        ok: false,
        error: 'Use a lower-case key with letters, numbers and underscores.',
        field: 'key',
      }
    }

    const result = await cmsCreate(
      'site_stats',
      {
        key,
        label: asString(values.label),
        detail: asNullableString(values.detail),
        value_kind: asString(values.value_kind, 'literal') as never,
        literal_value: asNullableString(values.literal_value),
        prefix: asNullableString(values.prefix),
        suffix: asNullableString(values.suffix),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'site_stat', summary: `Added the statistic “${asString(values.label)}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/statistics')
    return { ok: true, data: null }
  })
}

export async function updateStat(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const bad = checkStat(values)
    if (bad) return { ok: false, ...bad }

    const result = await cmsUpdate(
      'site_stats',
      'id',
      id,
      {
        label: asString(values.label),
        detail: asNullableString(values.detail),
        value_kind: asString(values.value_kind, 'literal') as never,
        literal_value: asNullableString(values.literal_value),
        prefix: asNullableString(values.prefix),
        suffix: asNullableString(values.suffix),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'site_stat', summary: `Edited the statistic “${asString(values.label)}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/statistics')
    return { ok: true, data: null }
  })
}

export async function setStatVisible(id: string, visible: boolean): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('site_stats', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'site_stat',
      summary: `${visible ? 'Showed' : 'Hid'} a statistic`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/statistics')
    return { ok: true, data: null }
  })
}

export async function deleteStat(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('site_stats', 'id', id, {
      actor,
      entity: 'site_stat',
      summary: 'Deleted a statistic',
    })
    if (!result.ok) return result
    revalidateContent('/admin/statistics')
    return { ok: true, data: null }
  })
}

export async function reorderStats(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('site_stats', 'id', ids, {
      actor,
      entity: 'site_stat',
      summary: 'Reordered the statistics',
    })
    if (!result.ok) return result
    revalidateContent('/admin/statistics')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export async function createFaq(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const question = asString(values.question)
    const answer = asString(values.answer)
    if (question.length < 3) return { ok: false, error: 'Write the question.', field: 'question' }
    if (answer.length < 3) return { ok: false, error: 'Write the answer.', field: 'answer' }

    const result = await cmsCreate(
      'faq_entries',
      {
        question,
        answer,
        category: asString(values.category, 'general'),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'faq', summary: `Added the question “${question.slice(0, 60)}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/faq')
    return { ok: true, data: null }
  })
}

export async function updateFaq(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const question = asString(values.question)
    const answer = asString(values.answer)
    if (question.length < 3) return { ok: false, error: 'Write the question.', field: 'question' }
    if (answer.length < 3) return { ok: false, error: 'Write the answer.', field: 'answer' }

    const result = await cmsUpdate(
      'faq_entries',
      'id',
      id,
      {
        question,
        answer,
        category: asString(values.category, 'general'),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'faq', summary: `Edited the question “${question.slice(0, 60)}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/faq')
    return { ok: true, data: null }
  })
}

export async function setFaqVisible(id: string, visible: boolean): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('faq_entries', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'faq',
      summary: `${visible ? 'Showed' : 'Hid'} a question`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/faq')
    return { ok: true, data: null }
  })
}

export async function deleteFaq(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('faq_entries', 'id', id, {
      actor,
      entity: 'faq',
      summary: 'Deleted a question',
    })
    if (!result.ok) return result
    revalidateContent('/admin/faq')
    return { ok: true, data: null }
  })
}

export async function reorderFaq(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('faq_entries', 'id', ids, {
      actor,
      entity: 'faq',
      summary: 'Reordered the FAQ',
    })
    if (!result.ok) return result
    revalidateContent('/admin/faq')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export async function createTestimonial(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const author = asString(values.author_name)
    const quote = asString(values.quote)
    if (!author) return { ok: false, error: 'Who said it?', field: 'author_name' }
    if (quote.length < 3) return { ok: false, error: 'Paste the quote.', field: 'quote' }

    const rating = asNumber(values.rating, 0)
    if (rating !== 0 && (rating < 1 || rating > 5)) {
      return { ok: false, error: 'A rating is 1 to 5, or leave it blank.', field: 'rating' }
    }

    const result = await cmsCreate(
      'testimonials',
      {
        author_name: author,
        author_role: asNullableString(values.author_role),
        author_company: asNullableString(values.author_company),
        author_url: asNullableString(values.author_url),
        avatar_media_id: asNullableString(values.avatar_media_id),
        quote,
        rating: rating === 0 ? null : rating,
        is_verified: asBoolean(values.is_verified, false),
        is_featured: asBoolean(values.is_featured, false),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'testimonial', summary: `Added a testimonial from ${author}` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/testimonials')
    return { ok: true, data: null }
  })
}

export async function updateTestimonial(
  id: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const author = asString(values.author_name)
    const quote = asString(values.quote)
    if (!author) return { ok: false, error: 'Who said it?', field: 'author_name' }
    if (quote.length < 3) return { ok: false, error: 'Paste the quote.', field: 'quote' }

    const rating = asNumber(values.rating, 0)

    const result = await cmsUpdate(
      'testimonials',
      'id',
      id,
      {
        author_name: author,
        author_role: asNullableString(values.author_role),
        author_company: asNullableString(values.author_company),
        author_url: asNullableString(values.author_url),
        avatar_media_id: asNullableString(values.avatar_media_id),
        quote,
        rating: rating === 0 ? null : rating,
        is_verified: asBoolean(values.is_verified, false),
        is_featured: asBoolean(values.is_featured, false),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'testimonial', summary: `Edited the testimonial from ${author}` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/testimonials')
    return { ok: true, data: null }
  })
}

export async function setTestimonialVisible(
  id: string,
  visible: boolean,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('testimonials', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'testimonial',
      summary: `${visible ? 'Published' : 'Unpublished'} a testimonial`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/testimonials')
    return { ok: true, data: null }
  })
}

export async function deleteTestimonial(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('testimonials', 'id', id, {
      actor,
      entity: 'testimonial',
      summary: 'Deleted a testimonial',
    })
    if (!result.ok) return result
    revalidateContent('/admin/testimonials')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Workflow steps
// ---------------------------------------------------------------------------

export async function createWorkflowStep(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const title = asString(values.title)
    if (!title) return { ok: false, error: 'Name the step.', field: 'title' }

    const result = await cmsCreate(
      'workflow_steps',
      {
        title,
        body: asString(values.body),
        artefact: asNullableString(values.artefact),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'workflow_step', summary: `Added the step “${title}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function updateWorkflowStep(
  id: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const title = asString(values.title)
    if (!title) return { ok: false, error: 'Name the step.', field: 'title' }

    const result = await cmsUpdate(
      'workflow_steps',
      'id',
      id,
      {
        title,
        body: asString(values.body),
        artefact: asNullableString(values.artefact),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'workflow_step', summary: `Edited the step “${title}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function setWorkflowStepVisible(
  id: string,
  visible: boolean,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('workflow_steps', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'workflow_step',
      summary: `${visible ? 'Showed' : 'Hid'} a workflow step`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function deleteWorkflowStep(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('workflow_steps', 'id', id, {
      actor,
      entity: 'workflow_step',
      summary: 'Deleted a workflow step',
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function reorderWorkflowSteps(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('workflow_steps', 'id', ids, {
      actor,
      entity: 'workflow_step',
      summary: 'Reordered the workflow steps',
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const NAV_GROUPS = [
  'header',
  'footer_product',
  'footer_workspace',
  'footer_account',
  'footer_note',
  'social',
  'legal',
]

export async function createNavLink(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const group = asString(values.nav_group)
    const label = asString(values.label)
    if (!NAV_GROUPS.includes(group)) {
      return { ok: false, error: 'Pick one of the listed groups.', field: 'nav_group' }
    }
    if (!label) return { ok: false, error: 'Give the link a label.', field: 'label' }

    const result = await cmsCreate(
      'nav_links',
      {
        nav_group: group as never,
        label,
        href: asString(values.href),
        icon: asNullableString(values.icon),
        is_route: asBoolean(values.is_route, true),
        is_external: asBoolean(values.is_external, false),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'nav_link', summary: `Added “${label}” to ${group}` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function updateNavLink(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const label = asString(values.label)
    if (!label) return { ok: false, error: 'Give the link a label.', field: 'label' }

    const result = await cmsUpdate(
      'nav_links',
      'id',
      id,
      {
        label,
        href: asString(values.href),
        icon: asNullableString(values.icon),
        is_route: asBoolean(values.is_route, true),
        is_external: asBoolean(values.is_external, false),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'nav_link', summary: `Edited the link “${label}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function setNavLinkVisible(
  id: string,
  visible: boolean,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('nav_links', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'nav_link',
      summary: `${visible ? 'Showed' : 'Hid'} a navigation link`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function deleteNavLink(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('nav_links', 'id', id, {
      actor,
      entity: 'nav_link',
      summary: 'Deleted a navigation link',
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

export async function reorderNavLinks(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('nav_links', 'id', ids, {
      actor,
      entity: 'nav_link',
      summary: 'Reordered navigation links',
    })
    if (!result.ok) return result
    revalidateContent('/admin/landing')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function createAnnouncement(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const title = asString(values.title)
    if (title.length < 2) return { ok: false, error: 'Give it a title.', field: 'title' }

    const startsAt = asInstant(values.starts_at)
    const endsAt = asInstant(values.ends_at)
    // `announcements_window_ordered` enforces this too; the check here is so the
    // operator gets a sentence beside the field rather than a constraint name.
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, error: 'The end has to come after the start.', field: 'ends_at' }
    }

    const result = await cmsCreate(
      'announcements',
      {
        title,
        body: asNullableString(values.body),
        variant: asString(values.variant, 'info') as never,
        href: asNullableString(values.href),
        cta_label: asNullableString(values.cta_label),
        placement: asString(values.placement, 'global') as never,
        is_dismissible: asBoolean(values.is_dismissible, true),
        starts_at: startsAt,
        ends_at: endsAt,
        is_active: asBoolean(values.is_active, true),
        sort_order: asNumber(values.sort_order, 999),
        created_by: actor.id,
      },
      { actor, entity: 'announcement', summary: `Scheduled the announcement “${title}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/announcements')
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  })
}

export async function updateAnnouncement(
  id: string,
  values: RecordValues,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const title = asString(values.title)
    if (title.length < 2) return { ok: false, error: 'Give it a title.', field: 'title' }

    const startsAt = asInstant(values.starts_at)
    const endsAt = asInstant(values.ends_at)
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, error: 'The end has to come after the start.', field: 'ends_at' }
    }

    const result = await cmsUpdate(
      'announcements',
      'id',
      id,
      {
        title,
        body: asNullableString(values.body),
        variant: asString(values.variant, 'info') as never,
        href: asNullableString(values.href),
        cta_label: asNullableString(values.cta_label),
        placement: asString(values.placement, 'global') as never,
        is_dismissible: asBoolean(values.is_dismissible, true),
        starts_at: startsAt,
        ends_at: endsAt,
        is_active: asBoolean(values.is_active, true),
      },
      { actor, entity: 'announcement', summary: `Edited the announcement “${title}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/announcements')
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  })
}

export async function setAnnouncementActive(
  id: string,
  active: boolean,
): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('announcements', 'id', id, 'is_active', active, {
      actor,
      entity: 'announcement',
      summary: `${active ? 'Activated' : 'Deactivated'} an announcement`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/announcements')
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  })
}

export async function deleteAnnouncement(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('announcements', 'id', id, {
      actor,
      entity: 'announcement',
      summary: 'Deleted an announcement',
    })
    if (!result.ok) return result
    revalidateContent('/admin/announcements')
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  })
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORY_SCOPES = ['preset', 'explore', 'model', 'media', 'faq']

export async function createCategory(values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const scope = asString(values.scope)
    const slug = asString(values.slug)
    const label = asString(values.label)

    if (!CATEGORY_SCOPES.includes(scope)) {
      return { ok: false, error: 'Pick one of the listed scopes.', field: 'scope' }
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,48}$/.test(slug)) {
      return {
        ok: false,
        error: 'Use lower-case letters, numbers, hyphens and underscores.',
        field: 'slug',
      }
    }
    if (!label) return { ok: false, error: 'Give it a label.', field: 'label' }

    const result = await cmsCreate(
      'content_categories',
      {
        scope: scope as never,
        slug,
        label,
        description: asNullableString(values.description),
        icon: asNullableString(values.icon),
        media_id: asNullableString(values.media_id),
        sort_order: asNumber(values.sort_order, 999),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'category', summary: `Added the ${scope} category “${label}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/categories')
    revalidatePath('/presets')
    return { ok: true, data: null }
  })
}

export async function updateCategory(id: string, values: RecordValues): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const label = asString(values.label)
    if (!label) return { ok: false, error: 'Give it a label.', field: 'label' }

    const result = await cmsUpdate(
      'content_categories',
      'id',
      id,
      {
        label,
        description: asNullableString(values.description),
        icon: asNullableString(values.icon),
        media_id: asNullableString(values.media_id),
        is_visible: asBoolean(values.is_visible, true),
      },
      { actor, entity: 'category', summary: `Edited the category “${label}”` },
    )

    if (!result.ok) return { ok: false, error: result.error, field: result.field }
    revalidateContent('/admin/categories')
    revalidatePath('/presets')
    return { ok: true, data: null }
  })
}

export async function setCategoryVisible(id: string, visible: boolean): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsToggle('content_categories', 'id', id, 'is_visible', visible, {
      actor,
      entity: 'category',
      summary: `${visible ? 'Showed' : 'Hid'} a category`,
    })
    if (!result.ok) return result
    revalidateContent('/admin/categories')
    return { ok: true, data: null }
  })
}

export async function deleteCategory(id: string): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsDelete('content_categories', 'id', id, {
      actor,
      entity: 'category',
      summary: 'Deleted a category',
    })
    if (!result.ok) return result
    revalidateContent('/admin/categories')
    return { ok: true, data: null }
  })
}

export async function reorderCategories(ids: string[]): Promise<AdminResult<null>> {
  return withCapability('content:write', async (actor) => {
    const result = await cmsReorder('content_categories', 'id', ids, {
      actor,
      entity: 'category',
      summary: 'Reordered categories',
    })
    if (!result.ok) return result
    revalidateContent('/admin/categories')
    return { ok: true, data: null }
  })
}
