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

export type UserRole = 'user' | 'admin'
export type PresetKind = 'motion' | 'style'
/**
 * Every vendor the app can name on a generation row.
 *
 * `mock`, `fal` and `replicate` are aggregators selected by AI_PROVIDER. The
 * rest are direct vendor accounts a user connects with their own key in
 * Settings -> AI model keys; see lib/ai/catalogue.ts for what each one is.
 * Keep this list in step with the `provider_name` enum in migration 0007.
 */
export type ProviderName =
  | 'mock'
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

/** Outcome of the last time we asked a vendor whether a stored key works. */
export type ProviderKeyStatus = 'unverified' | 'valid' | 'invalid' | 'unreachable'
export type GenerationTask = 'text_to_image' | 'text_to_video' | 'image_to_video'
export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type GenerationVisibility = 'private' | 'public'
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
  like_count: number
  remix_count: number
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
  reference: string | null
  failure_code: string | null
  created_at: string
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
        Insert: InsertOf<
          GenerationRow,
          'user_id' | 'task' | 'model_id' | 'idempotency_key'
        >
        Update: Partial<GenerationRow>
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
