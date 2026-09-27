import type { Json } from '@/types/database'

/**
 * The resolved settings object, and the defaults behind it.
 *
 * Two jobs in one file, and they belong together: the shape every surface reads,
 * and the values it gets when the database has nothing to say. Keeping the
 * defaults next to the interface is what makes "unreachable Postgres still
 * renders a complete page" a property you can check by reading one screen.
 *
 * Not `server-only`. The resolved object is produced on the server and handed
 * down as props, but a client component needs the type — and nothing in here is
 * secret. Settings rows that hold a credential are excluded at the query, not
 * here; see `PUBLIC_CATEGORIES` and the select list in
 * services/cms/settings.service.ts.
 *
 * Every default below is the literal the application shipped with, taken from
 * config/site.ts, lib/constants.ts and globals.css. A fresh clone must look
 * identical to a seeded one.
 */

export interface SiteSettings {
  site: {
    name: string
    shortName: string
    tagline: string
    description: string
    supportEmail: string | null
  }
  seo: {
    titleTemplate: string
    defaultTitle: string
    keywords: string[]
    ogImageUrl: string | null
    twitterHandle: string | null
    robotsIndex: boolean
  }
  branding: {
    logoUrl: string | null
    faviconUrl: string | null
    wordmarkText: string
    showWordmark: boolean
  }
  theme: {
    colorPrimary: string
    colorAccent: string
    colorBackground: string
    colorSurface: string
    colorCredit: string
    radius: string
    fontSans: string
    fontDisplay: string
    mode: 'dark' | 'light'
    animations: boolean
  }
  generation: {
    defaultTask: string
    defaultImageModel: string
    defaultVideoModel: string
    defaultProvider: string | null
  }
  limits: {
    maxPromptLength: number
    maxUploadMb: number
    jobTimeoutMinutes: number
  }
  storage: {
    provider: string
    uploadsBucket: string
    mediaBucket: string
  }
  legal: {
    copyright: string
    billingDisclaimer: string
  }
}

export const DEFAULT_SETTINGS: SiteSettings = {
  site: {
    name: 'Kinetic Studio',
    shortName: 'Kinetic',
    tagline: 'The AI creative workspace',
    description:
      'Kinetic Studio is a workspace for making images and video with open models. One composer, one credit balance, your own API keys — from a prompt to a finished shot without leaving the page.',
    supportEmail: null,
  },
  seo: {
    titleTemplate: '%s · Kinetic Studio',
    defaultTitle: 'Kinetic Studio — The AI creative workspace',
    keywords: [],
    ogImageUrl: null,
    twitterHandle: null,
    robotsIndex: true,
  },
  branding: {
    logoUrl: null,
    faviconUrl: null,
    wordmarkText: 'Kinetic Studio',
    showWordmark: true,
  },
  theme: {
    // The resolved values of the tokens in globals.css. Stored as the same
    // oklch() strings so a value pasted out of the stylesheet works, and an edit
    // is reversible by pasting the old one back.
    colorPrimary: 'oklch(0.8 0.135 200)',
    colorAccent: 'oklch(0.7 0.175 35)',
    colorBackground: 'oklch(0.175 0.007 250)',
    colorSurface: 'oklch(0.215 0.008 250)',
    colorCredit: 'oklch(0.83 0.145 88)',
    radius: '0.625rem',
    fontSans: 'Inter',
    fontDisplay: 'Space Grotesk',
    mode: 'dark',
    animations: true,
  },
  generation: {
    defaultTask: 'text_to_image',
    defaultImageModel: 'lumen-flash',
    defaultVideoModel: 'motion-turbo',
    defaultProvider: null,
  },
  limits: {
    maxPromptLength: 1200,
    maxUploadMb: 10,
    jobTimeoutMinutes: 6,
  },
  storage: {
    provider: 'supabase',
    uploadsBucket: 'uploads',
    mediaBucket: 'generations',
  },
  legal: {
    copyright:
      'An independent portfolio project, not affiliated with any commercial AI video service.',
    billingDisclaimer:
      'Checkout is simulated — no payment provider is connected, no card is charged and no card details are stored.',
  },
}

// ---------------------------------------------------------------------------
// Coercion
//
// A settings row is `jsonb`, which means "whatever was written". These readers
// take the value and the default and return the default for anything that is not
// the right shape — including `null`, which is how the seed stores "not set".
//
// Deliberately forgiving rather than throwing: a malformed settings row should
// cost one wrong-looking value on a page, not a 500 on every route.
// ---------------------------------------------------------------------------

export type SettingBag = Map<string, Json>

export function readString(bag: SettingBag, key: string, fallback: string): string {
  const value = bag.get(key)
  return typeof value === 'string' && value.trim() ? value : fallback
}

/** Like `readString` but `null` is a legitimate answer, not a missing one. */
export function readOptionalString(
  bag: SettingBag,
  key: string,
  fallback: string | null,
): string | null {
  if (!bag.has(key)) return fallback
  const value = bag.get(key)
  if (value === null) return null
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function readNumber(bag: SettingBag, key: string, fallback: number): number {
  const value = bag.get(key)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  // A number typed into a text field arrives as a string. Accepting it costs one
  // line and saves a class of "why did my limit not change" reports.
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

export function readBoolean(bag: SettingBag, key: string, fallback: boolean): boolean {
  const value = bag.get(key)
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function readStringArray(bag: SettingBag, key: string, fallback: string[]): string[] {
  const value = bag.get(key)
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  }
  // Also accept a comma-separated string, because that is what a keywords field
  // in a form produces and rejecting it would be pedantry.
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return fallback
}

/**
 * Folds a bag of rows into the resolved object.
 *
 * Explicit rather than a generic dotted-path assignment. A `set(obj, 'a.b', v)`
 * helper would be shorter and would also silently accept `site.nmae`, type the
 * result as `any`, and let a row written by hand create a property no surface
 * reads. Forty lines that the compiler checks is the better trade.
 */
export function resolveSettings(bag: SettingBag): SiteSettings {
  const d = DEFAULT_SETTINGS
  const mode = readString(bag, 'theme.mode', d.theme.mode)

  return {
    site: {
      name: readString(bag, 'site.name', d.site.name),
      shortName: readString(bag, 'site.short_name', d.site.shortName),
      tagline: readString(bag, 'site.tagline', d.site.tagline),
      description: readString(bag, 'site.description', d.site.description),
      supportEmail: readOptionalString(bag, 'site.support_email', d.site.supportEmail),
    },
    seo: {
      titleTemplate: readString(bag, 'seo.title_template', d.seo.titleTemplate),
      defaultTitle: readString(bag, 'seo.default_title', d.seo.defaultTitle),
      keywords: readStringArray(bag, 'seo.keywords', d.seo.keywords),
      ogImageUrl: readOptionalString(bag, 'seo.og_image_url', d.seo.ogImageUrl),
      twitterHandle: readOptionalString(bag, 'seo.twitter_handle', d.seo.twitterHandle),
      robotsIndex: readBoolean(bag, 'seo.robots_index', d.seo.robotsIndex),
    },
    branding: {
      logoUrl: readOptionalString(bag, 'branding.logo_url', d.branding.logoUrl),
      faviconUrl: readOptionalString(bag, 'branding.favicon_url', d.branding.faviconUrl),
      wordmarkText: readString(bag, 'branding.wordmark_text', d.branding.wordmarkText),
      showWordmark: readBoolean(bag, 'branding.show_wordmark', d.branding.showWordmark),
    },
    theme: {
      colorPrimary: readString(bag, 'theme.color_primary', d.theme.colorPrimary),
      colorAccent: readString(bag, 'theme.color_accent', d.theme.colorAccent),
      colorBackground: readString(bag, 'theme.color_background', d.theme.colorBackground),
      colorSurface: readString(bag, 'theme.color_surface', d.theme.colorSurface),
      colorCredit: readString(bag, 'theme.color_credit', d.theme.colorCredit),
      radius: readString(bag, 'theme.radius', d.theme.radius),
      fontSans: readString(bag, 'theme.font_sans', d.theme.fontSans),
      fontDisplay: readString(bag, 'theme.font_display', d.theme.fontDisplay),
      // This build is designed dark-only; anything other than the two known
      // values resolves to dark rather than to a half-styled page.
      mode: mode === 'light' ? 'light' : 'dark',
      animations: readBoolean(bag, 'theme.animations', d.theme.animations),
    },
    generation: {
      defaultTask: readString(bag, 'generation.default_task', d.generation.defaultTask),
      defaultImageModel: readString(
        bag,
        'generation.default_image_model',
        d.generation.defaultImageModel,
      ),
      defaultVideoModel: readString(
        bag,
        'generation.default_video_model',
        d.generation.defaultVideoModel,
      ),
      defaultProvider: readOptionalString(
        bag,
        'generation.default_provider',
        d.generation.defaultProvider,
      ),
    },
    limits: {
      maxPromptLength: readNumber(bag, 'limits.max_prompt_length', d.limits.maxPromptLength),
      maxUploadMb: readNumber(bag, 'limits.max_upload_mb', d.limits.maxUploadMb),
      jobTimeoutMinutes: readNumber(bag, 'limits.job_timeout_minutes', d.limits.jobTimeoutMinutes),
    },
    storage: {
      provider: readString(bag, 'storage.provider', d.storage.provider),
      uploadsBucket: readString(bag, 'storage.uploads_bucket', d.storage.uploadsBucket),
      mediaBucket: readString(bag, 'storage.media_bucket', d.storage.mediaBucket),
    },
    legal: {
      copyright: readString(bag, 'legal.copyright', d.legal.copyright),
      billingDisclaimer: readString(bag, 'legal.billing_disclaimer', d.legal.billingDisclaimer),
    },
  }
}

/**
 * The categories the admin UI groups settings into, in the order it shows them.
 *
 * A row whose category is not listed still renders — under "Other" — rather than
 * disappearing. A setting an operator cannot find is a setting they will assume
 * does not exist.
 */
export const SETTING_CATEGORIES = [
  { key: 'site', label: 'Site', description: 'Names, tagline and how to reach you.' },
  { key: 'seo', label: 'SEO & sharing', description: 'Titles, description and the Open Graph card.' },
  {
    key: 'generation',
    label: 'Generation defaults',
    description: 'What the composer opens on. Model ids must exist in the registry.',
  },
  { key: 'limits', label: 'Limits', description: 'Prompt length, upload size and the job timeout.' },
  { key: 'storage', label: 'Storage', description: 'Which buckets media is written to.' },
  { key: 'legal', label: 'Legal', description: 'The copyright line and the billing disclaimer.' },
  { key: 'branding', label: 'Branding', description: 'Logo, favicon and wordmark.' },
  { key: 'theme', label: 'Theme', description: 'Colours, type, radius and motion.' },
] as const
