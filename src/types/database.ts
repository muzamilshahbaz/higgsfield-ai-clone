/**
 * Database types.
 *
 * Hand-maintained to mirror supabase/migrations/0001_schema.sql so the app is
 * fully typed without requiring the Supabase CLI during the sprint.
 * Regenerate later with:  npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'user' | 'admin'
export type PresetKind = 'motion' | 'style'
export type ProviderName = 'mock' | 'fal' | 'replicate'
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

export interface ProfileRow {
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

export interface ProjectRow {
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

export interface PresetRow {
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

export interface GenerationRow {
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

export interface AssetRow {
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

export interface CreditLedgerRow {
  id: string
  user_id: string
  delta: number
  reason: CreditReason
  generation_id: string | null
  balance_after: number
  note: string | null
  created_at: string
}

export interface LikeRow {
  user_id: string
  generation_id: string
  created_at: string
}

/** Insert shape: everything optional except the columns the caller must supply. */
type InsertOf<T, R extends keyof T> = Omit<Partial<T>, R> & Pick<T, R>

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: InsertOf<ProfileRow, 'id' | 'handle'>
        Update: Partial<ProfileRow>
      }
      projects: {
        Row: ProjectRow
        Insert: InsertOf<ProjectRow, 'user_id' | 'title'>
        Update: Partial<ProjectRow>
      }
      presets: {
        Row: PresetRow
        Insert: InsertOf<
          PresetRow,
          'slug' | 'title' | 'kind' | 'category' | 'prompt_fragment' | 'model_id'
        >
        Update: Partial<PresetRow>
      }
      generations: {
        Row: GenerationRow
        Insert: InsertOf<
          GenerationRow,
          'user_id' | 'task' | 'model_id' | 'idempotency_key'
        >
        Update: Partial<GenerationRow>
      }
      assets: {
        Row: AssetRow
        Insert: InsertOf<AssetRow, 'generation_id' | 'user_id' | 'kind' | 'url'>
        Update: Partial<AssetRow>
      }
      credit_ledger: {
        Row: CreditLedgerRow
        Insert: InsertOf<CreditLedgerRow, 'user_id' | 'delta' | 'reason' | 'balance_after'>
        Update: Partial<CreditLedgerRow>
      }
      likes: {
        Row: LikeRow
        Insert: InsertOf<LikeRow, 'user_id' | 'generation_id'>
        Update: Partial<LikeRow>
      }
    }
    Views: Record<never, never>
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
    }
    Enums: {
      user_role: UserRole
      preset_kind: PresetKind
      provider_name: ProviderName
      generation_task: GenerationTask
      generation_status: GenerationStatus
      generation_visibility: GenerationVisibility
      asset_kind: AssetKind
      credit_reason: CreditReason
    }
    CompositeTypes: Record<never, never>
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
