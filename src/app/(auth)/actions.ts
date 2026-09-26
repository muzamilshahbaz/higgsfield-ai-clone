'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth'

/**
 * Auth Server Actions.
 *
 * Every action returns a plain `AuthState` rather than throwing, so the forms
 * can render field-level errors with useActionState. A successful sign-in or
 * sign-up ends in `redirect()`, which throws a framework control-flow signal —
 * so it is always called outside try/catch.
 */

export interface AuthState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: string
  /** Echoed back so the form can repopulate without losing what was typed. */
  values?: Record<string, string>
}

function flatten(issues: { path: (string | number)[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_')
    fieldErrors[key] ??= issue.message
  }
  return fieldErrors
}

/** Absolute origin for email + OAuth redirects, trusting the real request host. */
async function origin(): Promise<string> {
  const headerList = await headers()
  const forwardedHost = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const forwardedProto = headerList.get('x-forwarded-proto') ?? 'http'

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return env.siteUrl
}

// ---------------------------------------------------------------- sign in

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    next: String(formData.get('next') ?? ''),
  }

  const parsed = signInSchema.safeParse(raw)
  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error.issues), values: { email: raw.email } }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Deliberately vague: saying which half was wrong tells an attacker
    // whether an address is registered.
    return {
      error:
        error.message === 'Invalid login credentials'
          ? 'That email and password do not match.'
          : error.message,
      values: { email: parsed.data.email },
    }
  }

  revalidatePath('/', 'layout')
  redirect(safeNextPath(parsed.data.next))
}

// ---------------------------------------------------------------- sign up

/**
 * Whether to tell a visitor outright that an address already has an account.
 *
 * Supabase will not do this for you. With email confirmation on, signing up
 * with an address that is already registered returns **200 with no error** and
 * an obfuscated user carrying an empty `identities` array — verified against
 * this project, where the profile count does not move, so no second account is
 * ever created. GoTrue does that on purpose: an endpoint that answers "taken"
 * is an endpoint a stranger can use to harvest which of their addresses have
 * accounts here.
 *
 * Left off, which keeps sign-up consistent with the two other places that
 * already refuse to be an oracle: `signIn` will not say which half was wrong,
 * and `requestPasswordReset` gives the same answer whether or not it sent
 * anything. The copy below is written to be true either way, so a visitor is
 * never told a new account was created when one was not.
 *
 * Turning it on is a real trade, not a bug fix: better sign-up UX, at the cost
 * of confirming account existence to anyone who asks.
 */
const REVEAL_EXISTING_ACCOUNTS = false

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    displayName: String(formData.get('displayName') ?? ''),
    next: String(formData.get('next') ?? ''),
  }

  const parsed = signUpSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      fieldErrors: flatten(parsed.error.issues),
      values: { email: raw.email, displayName: raw.displayName },
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback`,
      // Read by handle_new_user() to seed display_name on the profile row.
      data: parsed.data.displayName ? { full_name: parsed.data.displayName } : undefined,
    },
  })

  if (error) {
    // Only reachable with email confirmation OFF. With it on, a duplicate is
    // not an error at all — see REVEAL_EXISTING_ACCOUNTS above.
    const alreadyRegistered = /already registered|already been registered/i.test(error.message)
    return {
      error: alreadyRegistered
        ? 'An account with that email already exists. Try signing in instead.'
        : error.message,
      values: { email: parsed.data.email, displayName: raw.displayName },
    }
  }

  // An empty `identities` array is GoTrue's tell that the address was already
  // taken. `?? 0` rather than a truthiness check: an absent array must not be
  // read as "this is a fresh account".
  const addressAlreadyInUse = (data.user?.identities?.length ?? 0) === 0

  if (REVEAL_EXISTING_ACCOUNTS && addressAlreadyInUse) {
    return {
      error: 'An account with that email already exists. Try signing in instead.',
      values: { email: parsed.data.email, displayName: raw.displayName },
    }
  }

  /*
    The project has email confirmation ON, so this is the normal exit: Supabase
    creates the user, returns no session, and sends a link that lands on
    /auth/callback to be exchanged for one.

    The branch still guards on `data.session` rather than assuming, because the
    setting lives in the Supabase dashboard and nothing in this repo pins it —
    turning it off should sign the user straight in, not strand them on a page
    telling them to check an inbox that will stay empty.
  */
  if (!data.session) {
    return {
      // Deliberately true whether or not the address was already registered.
      // The old wording promised a link unconditionally, which read as "a
      // second account has been made" to anyone signing up twice — the one
      // thing that never happens.
      success:
        'If that address is new here, a confirmation link is on its way — click it to activate your account. If it already has an account, nothing has changed and no second account was created.',
      values: { email: parsed.data.email },
    }
  }

  revalidatePath('/', 'layout')
  redirect(safeNextPath(parsed.data.next))
}

// ---------------------------------------------------------------- sign out

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath('/', 'layout')
  redirect('/')
}

// -------------------------------------------------------- password reset

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const raw = { email: String(formData.get('email') ?? '') }

  const parsed = forgotPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error.issues), values: raw }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
  })

  if (error) {
    console.error('[auth] resetPasswordForEmail failed:', error.message)
  }

  // Always the same answer, sent or not: otherwise this is an oracle for
  // which addresses have accounts.
  return {
    success: 'If an account exists for that address, a reset link is on its way.',
  }
}

export async function resetPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = {
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  }

  const parsed = resetPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error.issues) }
  }

  const supabase = await createClient()

  // The recovery link must already have been exchanged for a session by
  // /auth/callback; without it there is nobody to update.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: 'That reset link has expired. Request a new one and try again.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ---------------------------------------------------------------- OAuth

export async function signInWithGoogle(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const next = safeNextPath(String(formData.get('next') ?? ''))

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error || !data.url) {
    // Most likely cause: the Google provider is not enabled on the project.
    console.error('[auth] Google OAuth failed:', error?.message)
    return {
      error: 'Google sign-in is not available right now. Use your email and password instead.',
    }
  }

  redirect(data.url)
}
