import 'server-only'

import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { ProfileRow } from '@/types/database'

/**
 * Profile reads and updates.
 *
 * Everything here goes through the user-scoped client, so row level security
 * is the thing that stops one user reading another's profile — not a `where`
 * clause we might forget.
 */

export type Profile = ProfileRow

/** The signed-in user's profile, or null when signed out. */
export async function getMyProfile(): Promise<Profile | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

  if (error) {
    console.error('[profile.service] getMyProfile failed:', error.message)
    return null
  }
  return data
}

/**
 * Credit balance for the header pill.
 * Returns null rather than 0 when unknown, so the UI can tell "signed out or
 * unavailable" apart from "genuinely out of credits".
 */
export async function getMyCredits(): Promise<number | null> {
  const profile = await getMyProfile()
  return profile?.credits ?? null
}

/** A public profile by handle, for author bylines on Explore. */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('handle', handle)
    .maybeSingle()

  if (error) {
    console.error('[profile.service] getProfileByHandle failed:', error.message)
    return null
  }
  return data
}

export interface UpdateProfileInput {
  displayName?: string | null
  handle?: string
  avatarUrl?: string | null
}

export type UpdateProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string; field?: 'handle' }

/** Updates the signed-in user's own profile. RLS restricts this to their row. */
export async function updateMyProfile(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  // Typed as the row's own partial rather than a loose record: the client
  // rejects excess properties, so a typo here is a compile error, not a
  // silently ignored column.
  const patch: Partial<Profile> = {}
  if (input.displayName !== undefined) patch.display_name = input.displayName
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl
  if (input.handle !== undefined) patch.handle = input.handle.trim().toLowerCase()

  if (Object.keys(patch).length === 0) {
    const profile = await getMyProfile()
    return profile ? { ok: true, profile } : { ok: false, error: 'Profile not found.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('*')
    .single()

  if (error) {
    // 23505 = unique_violation, which for this table only ever means the handle.
    if (error.code === '23505') {
      return { ok: false, error: 'That handle is already taken.', field: 'handle' }
    }
    console.error('[profile.service] updateMyProfile failed:', error.message)
    return { ok: false, error: 'Could not save your profile. Try again.' }
  }

  return { ok: true, profile: data }
}

/** Whether a handle is free. Used for inline feedback before submitting. */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('handle', handle.trim())
    .maybeSingle()

  if (error) return false
  return data === null
}

/** Initials for the avatar fallback, e.g. "Ada Lovelace" -> "AL". */
export function initialsFor(profile: Pick<Profile, 'display_name' | 'handle' | 'email'>): string {
  const source = profile.display_name?.trim() || profile.handle || profile.email || '?'
  const words = source.split(/\s+/).filter(Boolean)

  if (words.length >= 2) {
    return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}
