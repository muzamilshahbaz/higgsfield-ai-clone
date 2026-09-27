/**
 * Database types.
 *
 * Hand-maintained to mirror supabase/migrations/0001_schema.sql so the app is
 * fully typed without requiring the Supabase CLI during the sprint.
 *
 * These are type ALIASES, not interfaces, and must stay that way. The Supabase
 * client constrains each table to Record<string, unknown>; TypeScript gives an
 * implicit index signature to object type aliases but never to interfaces, so
 * declaring these as interfaces silently degrades every query builder to
 * `never` with no error pointing here.
 * Regenerate later with:  npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/**
 * The staff ladder. 'user' and 'admin' are original; the other three arrived
 * with migration 0015 so that "can edit the FAQ" and "can rotate the fal.ai
 * key" stop being the same grant.
 *
 * The capability matrix is lib/admin/permissions.ts, not the database: it is a
 * product decision that changes more often than a schema, and it is far easier
 * to read — and to unit test — as a table of capabilities than as a pile of
 * policy expressions.
 */
export type UserRole = 'user' | 'editor' | 'moderator' | 'admin' | 'super_admin'

/** Mirrors the `account_status` enum (migration 0016). */
export type AccountStatus = 'active' | 'suspended' | 'banned'

/** Mirrors the `content_moderation_status` enum (migration 0016). */
export type ContentModerationStatus = 'approved' | 'pending' | 'hidden'
export type PresetKind = 'motion' | 'style'
/**
 * Every vendor the app can name on a generation row.
 *
 * `huggingface`, `fal` and `replicate` are the aggregators this build can
 * actually run a job through — every model in the registry names at least one
 * of them. The rest are direct vendor accounts a user can connect and verify
 * in Settings -> AI model keys, but no generation driver ships for them yet;
 * see lib/ai/catalogue.ts for what each one is.
 *
 * Keep this list in step with the `provider_name` enum in migrations 0007 and
 * 0010.
 */
export type ProviderName =
  | 'mock'
  | 'huggingface'
  | 'fal'
  | 'replicate'
  | 'flux'
  | 'stability'
  | 'openai'
  | 'google'
  | 'kling'
  | 'runway'
  | 'luma'
  | 'pika'

/**
 * What is in a media asset.
 *
 * The first six describe a photograph and are migration 0011's. The last three
 * arrived with 0015, when the table stopped being only a reference-photography
 * catalogue and started holding what an operator uploads — a logo, a favicon, an OG
 * image. None of those is a landscape or a still life, and without somewhere to put
 * them they would each be filed under whichever category was least wrong.
 */
export type MediaCategory =
  | 'landscape'
  | 'person'
  | 'animal'
  | 'urban'
  | 'abstract'
  | 'still_life'
  | 'brand'
  | 'ui'
  | 'other'

/**
 * Reference imagery the marketing page and the preset grid render.
 *
 * Never generated output: see migration 0011 and services/media.service.ts.
 *
 * Deliberately NOT registered in the `Database` map below — but the reason is
 * no longer the one originally written here.
 *
 * That note said an eleventh table tipped supabase-js's type machinery past an
 * instantiation limit and degraded the whole client generic to `never`. The
 * map now carries twelve tables (`favourites` and `comments` joined it in
 * migration 0013) and `tsc --noEmit` is clean; probing with three extra table
 * entries was also clean. So whatever that limit was, the current TypeScript
 * and supabase-js versions do not hit it at this size.
 *
 * This table stays out of the map because moving it in now would be churn for
 * no gain: `media.service.ts` already reads it through a narrowed client and
 * maps the rows back onto this interface, and that works. If a future table
 * genuinely needs registering, register it — and if the `never` degradation
 * ever comes back, it will be a real limit rather than this inherited belief.
 *
 * services/media.service.ts keeps the looseness in one file rather than
 * spreading it across the schema.
 */
export interface MediaAssetRow {
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
}

/** Outcome of the last time we asked a vendor whether a stored key works. */
export type ProviderKeyStatus = 'unverified' | 'valid' | 'invalid' | 'unreachable'
export type GenerationTask = 'text_to_image' | 'text_to_video' | 'image_to_video'
export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type GenerationVisibility = 'private' | 'public'

/**
 * The closed vocabulary a published shot can be tagged with.
 *
 * Mirrors the `generations_categories_allowed` check constraint, as last
 * rewritten by migration 0014 — the database is the enforcement point, this is
 * the compiler's copy, and tests/categories.test.ts fails if they disagree.
 *
 * Deliberately not a Postgres enum: categories are editorial, a new one is a
 * one-line constraint change, and an enum would make removing one a migration
 * that rewrites the table.
 */
export type ExploreCategorySlug =
  | 'portraits'
  | 'anime'
  | 'cinematic'
  | 'product'
  | 'nature'
  | 'architecture'
  | 'fantasy'
  | 'abstract'
  // Added in migration 0014.
  | 'fashion'
  | 'food'
  | 'technology'
export type AssetKind = 'image' | 'video' | 'poster'
export type CreditReason =
  | 'signup_grant'
  | 'generation_debit'
  | 'generation_refund'
  | 'admin_adjust'
  | 'promo'
  | 'subscription_grant'

/** See migration 0008. Mirrors what a payment provider would report. */
export type PlanTier = 'free' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
export type PaymentStatus = 'succeeded' | 'failed' | 'refunded'

export type ProfileRow = {
  id: string
  email: string | null
  handle: string
  display_name: string | null
  avatar_url: string | null
  credits: number
  role: UserRole
  /**
   * Account state, added by migration 0016 and defaulting to 'active', so every
   * row that existed before it keeps behaving as it did.
   *
   * Enforced in lib/supabase/middleware.ts rather than in a policy: RLS on this
   * table is own-row, and a suspended user must still be able to read their own
   * profile — that is what the suspension notice needs in order to explain
   * itself.
   */
  status: AccountStatus
  status_reason: string | null
  status_changed_at: string | null
  status_changed_by: string | null
  /** A suspension with an end date lifts itself. A ban has none. */
  suspended_until: string | null
  /** Operator-only. Never rendered on a surface the account itself can see. */
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProjectRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  cover_url: string | null
  is_default: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type PresetRow = {
  id: string
  slug: string
  title: string
  description: string | null
  kind: PresetKind
  category: string
  prompt_fragment: string
  negative_prompt: string | null
  model_id: string
  params: Json
  preview_video_url: string | null
  preview_poster_url: string | null
  accent: string | null
  credit_cost: number
  sort_order: number
  is_featured: boolean
  is_active: boolean
  created_at: string
}

export type GenerationRow = {
  id: string
  user_id: string
  project_id: string | null
  preset_id: string | null
  parent_id: string | null
  author_handle: string | null
  author_name: string | null
  author_avatar_url: string | null
  task: GenerationTask
  status: GenerationStatus
  progress: number
  prompt: string
  resolved_prompt: string
  negative_prompt: string | null
  input_image_url: string | null
  model_id: string
  provider: ProviderName
  provider_job_id: string | null
  params: Json
  seed: number | null
  duration_sec: number | null
  aspect_ratio: string
  credit_cost: number
  provider_cost_usd: number | null
  error_code: string | null
  error_message: string | null
  visibility: GenerationVisibility
  /** Optional headline. Most shots are known by their prompt; see migration 0013. */
  title: string | null
  /**
   * Browse tags from a closed vocabulary — see `lib/categories.ts`, which the
   * `generations_categories_allowed` check constraint mirrors.
   */
  categories: ExploreCategorySlug[]
  like_count: number
  comment_count: number
  favourite_count: number
  download_count: number
  /**
   * Weighted engagement, maintained by Postgres as a generated column.
   * Read-only: writing to it is an error, which is why it is absent from the
   * Update shape below.
   */
  engagement_score: number
  remix_count: number
  /**
   * The moderation record, added by 0016 and defaulting to 'approved' so no
   * existing read path changes. Hiding a shot sets `visibility = 'private'` —
   * the mechanism the Explore feed already enforces — and records the reason
   * here. The status is the trail; visibility is the enforcement.
   */
  moderation_status: ContentModerationStatus
  /** Editorially promoted. Read by the landing showcase, never by the feed. */
  is_featured: boolean
  moderation_note: string | null
  moderated_at: string | null
  moderated_by: string | null
  idempotency_key: string
  queued_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AssetRow = {
  id: string
  generation_id: string
  user_id: string
  kind: AssetKind
  url: string
  storage_path: string | null
  mime_type: string | null
  width: number | null
  height: number | null
  duration_ms: number | null
  size_bytes: number | null
  sort_order: number
  created_at: string
}

export type CreditLedgerRow = {
  id: string
  user_id: string
  delta: number
  reason: CreditReason
  generation_id: string | null
  balance_after: number
  note: string | null
  created_at: string
}

export type LikeRow = {
  user_id: string
  generation_id: string
  created_at: string
}

/**
 * A private bookmark. Deliberately a different table from `likes`: a like is
 * public applause with a counter behind it, a favourite is only ever listed
 * by the person who made it. See migration 0013.
 */
export type FavouriteRow = {
  user_id: string
  generation_id: string
  created_at: string
}

/**
 * One comment on a published generation.
 *
 * The three author fields are denormalised, exactly as they are on
 * `generations` and for the same reason: `profiles_select_own` is strictly
 * own-row, so a public thread cannot join to a profile to find a name.
 *
 * `parent_id` is at most one level deep — `add_comment()` re-points a reply to
 * a reply at its root, so the renderer never meets a chain.
 */
export type CommentRow = {
  id: string
  generation_id: string
  user_id: string
  parent_id: string | null
  author_handle: string | null
  author_name: string | null
  author_avatar_url: string | null
  body: string
  /**
   * Hidden by a moderator. Reversible on purpose: the generation's
   * `comment_count` stays honest about what was said, and an over-eager hide
   * costs nothing to undo. services/comment.service.ts filters on it.
   */
  is_hidden: boolean
  hidden_at: string | null
  hidden_by: string | null
  created_at: string
  updated_at: string
}

/**
 * A user's sealed provider credential.
 *
 * `ciphertext` is base64(iv || auth tag || sealed bytes) and never leaves the
 * server. `key_prefix` and `last4` are the only parts the UI is given, so the
 * masked display costs no decryption. See migration 0007 for why this table
 * has RLS enabled with no policies at all.
 */
export type UserProviderKeyRow = {
  id: string
  user_id: string
  provider: ProviderName
  label: string | null
  ciphertext: string
  key_prefix: string
  last4: string
  status: ProviderKeyStatus
  last_verified_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionRow = {
  id: string
  user_id: string
  plan: PlanTier
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  created_at: string
  updated_at: string
}

/**
 * A billing-history row. `card_brand` and `card_last4` are what a receipt
 * shows; the card number itself is never written here or anywhere else.
 */
export type PaymentTransactionRow = {
  id: string
  user_id: string
  plan: PlanTier
  amount_pence: number
  currency: string
  status: PaymentStatus
  description: string
  card_brand: string | null
  card_last4: string | null
  /** ISO 3166-1 alpha-2. Name and flag are derived in the app. */
  billing_country: string | null
  reference: string | null
  failure_code: string | null
  created_at: string
}

/**
 * What a creator's published work has earned, aggregated in Postgres.
 *
 * Returned by the `creator_stats()` function, which is scoped to `auth.uid()`
 * and takes no arguments — there is no form of this call that reports on
 * anybody else.
 */
export type CreatorStatsRow = {
  public_count: number
  private_count: number
  likes_received: number
  downloads_received: number
  favourites_received: number
  comments_received: number
}

/**
 * `Relationships` is required by the client's GenericTable constraint. It is
 * left empty here because we query tables explicitly rather than through
 * PostgREST embedded resources; `npm run db:types` emits the real foreign-key
 * entries once the Supabase CLI has a full-access token.
 */

/** Insert shape: everything optional except the columns the caller must supply. */
type InsertOf<T, R extends keyof T> = Omit<Partial<T>, R> & Pick<T, R>

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: InsertOf<ProfileRow, 'id' | 'handle'>
        Update: Partial<ProfileRow>
        Relationships: []
      }
      projects: {
        Row: ProjectRow
        Insert: InsertOf<ProjectRow, 'user_id' | 'title'>
        Update: Partial<ProjectRow>
        Relationships: []
      }
      presets: {
        Row: PresetRow
        Insert: InsertOf<
          PresetRow,
          'slug' | 'title' | 'kind' | 'category' | 'prompt_fragment' | 'model_id'
        >
        Update: Partial<PresetRow>
        Relationships: []
      }
      generations: {
        Row: GenerationRow
        // `engagement_score` is GENERATED ALWAYS: Postgres rejects a write to
        // it, so it is removed from both write shapes rather than left as a
        // column the compiler says is settable.
        Insert: Omit<
          InsertOf<GenerationRow, 'user_id' | 'task' | 'model_id' | 'idempotency_key'>,
          'engagement_score'
        >
        Update: Partial<Omit<GenerationRow, 'engagement_score'>>
        Relationships: []
      }
      assets: {
        Row: AssetRow
        Insert: InsertOf<AssetRow, 'generation_id' | 'user_id' | 'kind' | 'url'>
        Update: Partial<AssetRow>
        Relationships: []
      }
      credit_ledger: {
        Row: CreditLedgerRow
        Insert: InsertOf<CreditLedgerRow, 'user_id' | 'delta' | 'reason' | 'balance_after'>
        Update: Partial<CreditLedgerRow>
        Relationships: []
      }
      likes: {
        Row: LikeRow
        Insert: InsertOf<LikeRow, 'user_id' | 'generation_id'>
        Update: Partial<LikeRow>
        Relationships: []
      }
      favourites: {
        Row: FavouriteRow
        Insert: InsertOf<FavouriteRow, 'user_id' | 'generation_id'>
        Update: Partial<FavouriteRow>
        Relationships: []
      }
      comments: {
        Row: CommentRow
        Insert: InsertOf<CommentRow, 'generation_id' | 'user_id' | 'body'>
        Update: Partial<CommentRow>
        Relationships: []
      }
      user_provider_keys: {
        Row: UserProviderKeyRow
        Insert: InsertOf<UserProviderKeyRow, 'user_id' | 'provider' | 'ciphertext'>
        Update: Partial<UserProviderKeyRow>
        Relationships: []
      }
      subscriptions: {
        Row: SubscriptionRow
        Insert: InsertOf<SubscriptionRow, 'user_id'>
        Update: Partial<SubscriptionRow>
        Relationships: []
      }
      payment_transactions: {
        Row: PaymentTransactionRow
        Insert: InsertOf<
          PaymentTransactionRow,
          'user_id' | 'plan' | 'amount_pence' | 'status' | 'description'
        >
        Update: Partial<PaymentTransactionRow>
        Relationships: []
      }
    }
    // `{ [_ in never]: never }` is the shape the Supabase codegen emits for an
    // empty group. `Record<never, never>` resolves to `{}`, which has no string
    // index signature and so fails the client's GenericSchema constraint —
    // silently degrading every query builder to `never`.
    Views: { [_ in never]: never }
    Functions: {
      spend_credits: {
        Args: {
          p_user_id: string
          p_amount: number
          p_generation_id?: string | null
          p_note?: string | null
        }
        Returns: number
      }
      refund_credits: {
        Args: {
          p_user_id: string
          p_amount: number
          p_generation_id: string
          p_note?: string | null
        }
        Returns: number
      }
      toggle_like: {
        Args: { p_generation_id: string }
        Returns: boolean
      }
      toggle_favourite: {
        Args: { p_generation_id: string }
        Returns: boolean
      }
      add_comment: {
        Args: { p_generation_id: string; p_body: string; p_parent_id?: string | null }
        Returns: string
      }
      delete_comment: {
        Args: { p_comment_id: string }
        Returns: number
      }
      register_download: {
        Args: { p_generation_id: string }
        Returns: number
      }
      creator_stats: {
        Args: Record<string, never>
        Returns: CreatorStatsRow[]
      }
      ensure_default_project: {
        Args: { p_user_id: string }
        Returns: string
      }
      set_subscription_credits: {
        Args: { p_user_id: string; p_amount: number; p_note?: string | null }
        Returns: number
      }
    }
    Enums: {
      user_role: UserRole
      preset_kind: PresetKind
      provider_name: ProviderName
      provider_key_status: ProviderKeyStatus
      generation_task: GenerationTask
      generation_status: GenerationStatus
      generation_visibility: GenerationVisibility
      asset_kind: AssetKind
      credit_reason: CreditReason
      subscription_status: SubscriptionStatus
      plan_tier: PlanTier
      payment_status: PaymentStatus
      account_status: AccountStatus
      content_moderation_status: ContentModerationStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

/** A generation joined with its assets — the shape the gallery renders. */
export interface GenerationWithAssets extends GenerationRow {
  assets: AssetRow[]
}

export const TERMINAL_STATUSES: GenerationStatus[] = ['succeeded', 'failed', 'canceled']

export function isTerminal(status: GenerationStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}
