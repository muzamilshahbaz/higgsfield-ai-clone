/**
 * CMS database types.
 *
 * Hand-maintained to mirror supabase/migrations/0016_cms.sql, the same way
 * types/database.ts mirrors 0001.
 *
 * These live in their own `CmsDatabase` map rather than joining the one in
 * types/database.ts, and that is a deliberate boundary rather than a workaround.
 *
 *   · It keeps the application's schema map stable. Twenty tables that only the
 *     admin panel and the marketing page touch would otherwise sit in the
 *     generic every query in the app instantiates.
 *   · It makes the privilege split visible in the type system. A service that
 *     imports the CMS client cannot accidentally reach `credit_ledger`, and one
 *     that imports the app client cannot reach `app_provider_keys`.
 *   · `media_assets` finally gets a typed home. It was queried through a
 *     hand-rolled loose client in services/media.service.ts; the read path there
 *     is unchanged, but everything new goes through this map.
 *
 * Same rule as the other file: these are type ALIASES, not interfaces. The
 * Supabase client constrains each table to Record<string, unknown>, and
 * TypeScript gives an implicit index signature to object aliases but never to
 * interfaces — declaring one as an interface silently degrades every query
 * builder on it to `never` with no error pointing here.
 */

import type { Json, MediaCategory, ProviderKeyStatus } from '@/types/database'

// ---------------------------------------------------------------------------
// Vocabularies
//
// Text-with-a-check-constraint in Postgres, unions here. The database is the
// enforcement point; these are the compiler's copy, and each one names the
// migration it mirrors so a drift has somewhere to be fixed.
// ---------------------------------------------------------------------------

/** Mirrors the `account_status` enum (0016). */
export type AccountStatus = 'active' | 'suspended' | 'banned'

/** Mirrors the `content_moderation_status` enum (0016). */
export type ModerationStatus = 'approved' | 'pending' | 'hidden'

/** Mirrors the `log_level` enum (0016). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Mirrors `site_features_placement_allowed`. */
export type FeaturePlacement = 'features' | 'overview' | 'capabilities' | 'footer_note'

/** Mirrors `site_stats_value_kind_allowed`. */
export type StatValueKind =
  | 'literal'
  | 'models'
  | 'presets'
  | 'providers'
  | 'signup_credits'
  | 'creators'
  | 'projects'
  | 'assets'
  | 'countries'
  | 'public_generations'

/** Mirrors `announcements_variant_allowed`. */
export type AnnouncementVariant = 'info' | 'success' | 'warning' | 'danger' | 'brand'

/** Mirrors `announcements_placement_allowed`. */
export type AnnouncementPlacement = 'global' | 'marketing' | 'studio' | 'admin'

/** Mirrors `nav_links_group_allowed`. */
export type NavGroup =
  | 'header'
  | 'footer_product'
  | 'footer_workspace'
  | 'footer_account'
  | 'footer_note'
  | 'social'
  | 'legal'

/** Mirrors `plans_billing_period_allowed`. */
export type BillingPeriod = 'monthly' | 'yearly' | 'lifetime' | 'none'

/** Mirrors `ai_providers_status_allowed`. */
export type ProviderStatus = 'active' | 'beta' | 'deprecated' | 'disabled'

/** Mirrors `ai_models_status_allowed`. */
export type ModelStatus = 'active' | 'beta' | 'deprecated' | 'hidden'

/** Mirrors `ai_providers_media_allowed`. */
export type ProviderMediaKind = 'image' | 'video' | 'both'

/** Mirrors `content_categories_scope_allowed`. */
export type CategoryScope = 'preset' | 'explore' | 'model' | 'media' | 'faq'

/** Mirrors `media_assets_source_allowed` (0016). */
export type MediaSource = 'external' | 'upload'

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type AppSettingRow = {
  key: string
  value: Json
  category: string
  label: string
  description: string | null
  is_public: boolean
  is_secret: boolean
  sort_order: number
  updated_at: string
  updated_by: string | null
}

export type FeatureFlagRow = {
  key: string
  label: string
  description: string | null
  enabled: boolean
  category: string
  sort_order: number
  updated_at: string
  updated_by: string | null
}

export type LandingSectionRow = {
  key: string
  label: string
  index_label: string | null
  eyebrow: string | null
  title: string | null
  lead: string | null
  body: string | null
  cta_label: string | null
  cta_href: string | null
  media_id: string | null
  config: Json
  is_visible: boolean
  sort_order: number
  updated_at: string
  updated_by: string | null
}

export type SiteFeatureRow = {
  id: string
  placement: FeaturePlacement
  title: string
  body: string
  detail: string | null
  icon: string | null
  span: string | null
  href: string | null
  media_id: string | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type SiteStatRow = {
  id: string
  key: string
  label: string
  detail: string | null
  value_kind: StatValueKind
  literal_value: string | null
  prefix: string | null
  suffix: string | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type FaqEntryRow = {
  id: string
  question: string
  answer: string
  category: string
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type TestimonialRow = {
  id: string
  author_name: string
  author_role: string | null
  author_company: string | null
  author_url: string | null
  avatar_media_id: string | null
  avatar_url: string | null
  quote: string
  rating: number | null
  is_verified: boolean
  is_featured: boolean
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type AnnouncementRow = {
  id: string
  title: string
  body: string | null
  variant: AnnouncementVariant
  href: string | null
  cta_label: string | null
  placement: AnnouncementPlacement
  is_dismissible: boolean
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export type WorkflowStepRow = {
  id: string
  title: string
  body: string
  artefact: string | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type NavLinkRow = {
  id: string
  nav_group: NavGroup
  label: string
  href: string
  icon: string | null
  is_route: boolean
  is_external: boolean
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

/**
 * A pricing tier.
 *
 * `price_usd` is `numeric(10,2)` in Postgres. PostgREST serialises it as a JSON
 * number, but a numeric column has arrived as a string through other drivers
 * before now — so every read path coerces with `Number()` rather than trusting
 * this annotation. See `toPlan` in services/cms/plans.service.ts.
 */
export type PlanRow = {
  id: string
  name: string
  tagline: string
  price_usd: number
  cadence: string
  billing_period: BillingPeriod
  credits: number
  max_concurrent_jobs: number
  max_generations_per_hour: number
  rank: number
  perks: string[]
  cta_label: string | null
  is_popular: boolean
  is_visible: boolean
  sort_order: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type PlanFeatureRow = {
  id: string
  label: string
  /** Keyed by plan id: a boolean renders as a tick or a dash, a string as itself. */
  values: Json
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type CreditRuleRow = {
  key: string
  label: string
  description: string | null
  amount: number
  enabled: boolean
  sort_order: number
  updated_at: string
  updated_by: string | null
}

export type AiProviderRow = {
  id: string
  label: string
  description: string
  logo_url: string | null
  logo_media_id: string | null
  media: ProviderMediaKind
  console_url: string | null
  docs_url: string | null
  key_placeholder: string
  key_min_length: number
  key_pattern: string | null
  is_recommended: boolean
  is_enabled: boolean
  generation_ready: boolean
  status: ProviderStatus
  sort_order: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

/**
 * The operator's shared vendor key.
 *
 * `ciphertext` is base64(iv ‖ tag ‖ sealed bytes) and never leaves the server.
 * Nothing that renders is given more than `key_prefix` and `last4`; see
 * services/cms/provider-keys.service.ts, which spells out its select list for
 * exactly that reason.
 */
export type AppProviderKeyRow = {
  provider: string
  label: string | null
  ciphertext: string
  key_prefix: string
  last4: string
  status: ProviderKeyStatus
  last_verified_at: string | null
  last_error: string | null
  rotated_at: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type AiModelRow = {
  id: string
  label: string
  provider_id: string | null
  description: string
  basis: string | null
  use_case: string | null
  image_url: string | null
  media_id: string | null
  category: string | null
  tags: string[]
  capabilities: string[]
  input_types: string[]
  output_types: string[]
  is_recommended: boolean
  is_featured: boolean
  show_on_landing: boolean
  status: ModelStatus
  sort_order: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type ContentCategoryRow = {
  id: string
  scope: CategoryScope
  slug: string
  label: string
  description: string | null
  icon: string | null
  media_id: string | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string
}

/**
 * The media library row — `media_assets` as it stands after 0016.
 *
 * The columns up to `tags` are 0011's reference-photography catalogue; the rest
 * are what a manager needs in order to upload, organise and delete.
 */
export type MediaLibraryRow = {
  id: string
  slug: string
  category: MediaCategory
  url: string
  alt: string
  width: number | null
  height: number | null
  credit_name: string | null
  credit_url: string | null
  tags: string[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  title: string | null
  folder: string
  /** Set for an upload; the object this row owns in the public bucket. */
  storage_path: string | null
  mime_type: string | null
  size_bytes: number | null
  source: MediaSource
  uploaded_by: string | null
}

export type AuditLogRow = {
  id: string
  actor_id: string | null
  actor_email: string | null
  actor_role: string | null
  action: string
  entity: string
  entity_id: string | null
  summary: string
  before: Json | null
  after: Json | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

export type SystemLogRow = {
  id: string
  level: LogLevel
  source: string
  event: string
  message: string
  context: Json | null
  user_id: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Function return shapes
// ---------------------------------------------------------------------------

/** Every count `admin_overview()` returns. See 0016 for how each is scoped. */
export type AdminOverview = {
  users: number
  users_active: number
  users_suspended: number
  users_new_7d: number
  staff: number
  projects: number
  generations: number
  generations_24h: number
  generations_failed: number
  generations_running: number
  assets: number
  public_shots: number
  comments: number
  comments_hidden: number
  credits_held: number
  credits_spent_30d: number
  subscriptions_paid: number
  revenue_minor_30d: number
  media: number
  presets: number
  errors_24h: number
}

/**
 * What `site_metrics()` returns — the only aggregates an anonymous visitor may
 * read. See migration 0018 for why this is a function rather than four counts
 * against the tables.
 */
export type SiteMetrics = {
  creators: number
  projects: number
  assets: number
  public_generations: number
  presets: number
  countries: number
}

export type AdminDailyRow = {
  day: string
  generations: number
  signups: number
  credits_spent: number
  revenue_minor: number
}

// ---------------------------------------------------------------------------
// The schema map
// ---------------------------------------------------------------------------

/** Insert shape: everything optional except the columns the caller must supply. */
type InsertOf<T, R extends keyof T> = Omit<Partial<T>, R> & Pick<T, R>

export type CmsDatabase = {
  public: {
    Tables: {
      app_settings: {
        Row: AppSettingRow
        Insert: InsertOf<AppSettingRow, 'key' | 'value'>
        Update: Partial<AppSettingRow>
        Relationships: []
      }
      feature_flags: {
        Row: FeatureFlagRow
        Insert: InsertOf<FeatureFlagRow, 'key' | 'label'>
        Update: Partial<FeatureFlagRow>
        Relationships: []
      }
      landing_sections: {
        Row: LandingSectionRow
        Insert: InsertOf<LandingSectionRow, 'key' | 'label'>
        Update: Partial<LandingSectionRow>
        Relationships: []
      }
      site_features: {
        Row: SiteFeatureRow
        Insert: InsertOf<SiteFeatureRow, 'title'>
        Update: Partial<SiteFeatureRow>
        Relationships: []
      }
      site_stats: {
        Row: SiteStatRow
        Insert: InsertOf<SiteStatRow, 'key' | 'label'>
        Update: Partial<SiteStatRow>
        Relationships: []
      }
      faq_entries: {
        Row: FaqEntryRow
        Insert: InsertOf<FaqEntryRow, 'question' | 'answer'>
        Update: Partial<FaqEntryRow>
        Relationships: []
      }
      testimonials: {
        Row: TestimonialRow
        Insert: InsertOf<TestimonialRow, 'author_name' | 'quote'>
        Update: Partial<TestimonialRow>
        Relationships: []
      }
      announcements: {
        Row: AnnouncementRow
        Insert: InsertOf<AnnouncementRow, 'title'>
        Update: Partial<AnnouncementRow>
        Relationships: []
      }
      workflow_steps: {
        Row: WorkflowStepRow
        Insert: InsertOf<WorkflowStepRow, 'title'>
        Update: Partial<WorkflowStepRow>
        Relationships: []
      }
      nav_links: {
        Row: NavLinkRow
        Insert: InsertOf<NavLinkRow, 'nav_group' | 'label'>
        Update: Partial<NavLinkRow>
        Relationships: []
      }
      plans: {
        Row: PlanRow
        Insert: InsertOf<PlanRow, 'id' | 'name'>
        Update: Partial<PlanRow>
        Relationships: []
      }
      plan_features: {
        Row: PlanFeatureRow
        Insert: InsertOf<PlanFeatureRow, 'label'>
        Update: Partial<PlanFeatureRow>
        Relationships: []
      }
      credit_rules: {
        Row: CreditRuleRow
        Insert: InsertOf<CreditRuleRow, 'key' | 'label'>
        Update: Partial<CreditRuleRow>
        Relationships: []
      }
      ai_providers: {
        Row: AiProviderRow
        Insert: InsertOf<AiProviderRow, 'id' | 'label'>
        Update: Partial<AiProviderRow>
        Relationships: []
      }
      app_provider_keys: {
        Row: AppProviderKeyRow
        Insert: InsertOf<AppProviderKeyRow, 'provider' | 'ciphertext'>
        Update: Partial<AppProviderKeyRow>
        Relationships: []
      }
      ai_models: {
        Row: AiModelRow
        Insert: InsertOf<AiModelRow, 'id' | 'label'>
        Update: Partial<AiModelRow>
        Relationships: []
      }
      content_categories: {
        Row: ContentCategoryRow
        Insert: InsertOf<ContentCategoryRow, 'scope' | 'slug' | 'label'>
        Update: Partial<ContentCategoryRow>
        Relationships: []
      }
      media_assets: {
        Row: MediaLibraryRow
        Insert: InsertOf<MediaLibraryRow, 'slug' | 'category' | 'url' | 'alt'>
        Update: Partial<MediaLibraryRow>
        Relationships: []
      }
      audit_log: {
        Row: AuditLogRow
        Insert: InsertOf<AuditLogRow, 'action' | 'entity'>
        // Append-only. `never` here is the compiler enforcing what the design
        // says: there is no legitimate edit to an audit row.
        Update: never
        Relationships: []
      }
      system_logs: {
        Row: SystemLogRow
        Insert: InsertOf<SystemLogRow, 'event'>
        Update: never
        Relationships: []
      }
    }
    // `{ [_ in never]: never }` is the shape the Supabase codegen emits for an
    // empty group. `Record<never, never>` resolves to `{}`, which has no string
    // index signature and so fails the client's GenericSchema constraint —
    // silently degrading every query builder to `never`.
    Views: { [_ in never]: never }
    Functions: {
      admin_overview: {
        Args: Record<never, never>
        Returns: AdminOverview
      }
      admin_daily_series: {
        Args: { p_days?: number }
        Returns: AdminDailyRow[]
      }
      admin_adjust_credits: {
        Args: { p_user_id: string; p_delta: number; p_note?: string | null }
        Returns: number
      }
      site_metrics: {
        Args: Record<never, never>
        Returns: SiteMetrics
      }
    }
    Enums: {
      account_status: AccountStatus
      content_moderation_status: ModerationStatus
      log_level: LogLevel
    }
    CompositeTypes: { [_ in never]: never }
  }
}
