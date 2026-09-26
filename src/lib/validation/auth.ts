import { z } from 'zod'

/**
 * Auth input schemas.
 *
 * Shared between the client forms and the Server Actions, so the browser and
 * the server enforce exactly the same rules and the error copy never drifts.
 */

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email('That does not look like an email address.')
  .max(254, 'That email address is too long.')

/**
 * The password rules, as data.
 *
 * These mirror the Supabase project's own settings — minimum 8, and one each
 * of lowercase, uppercase, digit and symbol. They live here as a list rather
 * than a regex so the sign-up form can tick them off live: with five rules, a
 * single "that password is invalid" message makes the user guess, and a schema
 * that reports one issue at a time turns signing up into five round trips.
 *
 * The symbol set is the one GoTrue uses for `lower_upper_letters_digits_symbols`
 * rather than "any non-alphanumeric". A looser test here would accept a
 * character Supabase then rejects, which is the exact failure this is meant to
 * prevent — better to be marginally stricter than the server and say which
 * characters count.
 */
export const PASSWORD_MIN = 8
/** bcrypt silently truncates beyond 72 bytes, so anything longer is a lie. */
export const PASSWORD_MAX = 72

const SYMBOL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/

export interface PasswordRule {
  id: string
  label: string
  test: (value: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (v) => v.length >= PASSWORD_MIN },
  { id: 'lower', label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'A number', test: (v) => /[0-9]/.test(v) },
  { id: 'symbol', label: 'A symbol, such as ! ? @ or #', test: (v) => SYMBOL.test(v) },
]

/**
 * The first rule a password fails, or null. The form uses this for the single
 * error message; the checklist beside it shows all five at once.
 */
export function firstPasswordFailure(value: string): PasswordRule | null {
  return PASSWORD_RULES.find((rule) => !rule.test(value)) ?? null
}

const password = z
  .string()
  .max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`)
  .superRefine((value, ctx) => {
    const failed = firstPasswordFailure(value)
    if (!failed) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        failed.id === 'length'
          ? `Use at least ${PASSWORD_MIN} characters.`
          : `Add ${failed.label.replace(/^A /, 'a ').toLowerCase()}.`,
    })
  })

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().optional(),
})

export const signUpSchema = z.object({
  email,
  password,
  displayName: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters.')
    .max(48, 'Use 48 characters or fewer.')
    .optional()
    .or(z.literal('')),
  next: z.string().optional(),
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  })

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/**
 * Only same-origin relative paths may be used as a post-login redirect.
 * An open redirect here would let a phishing link bounce a freshly
 * authenticated user straight off the site.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  // `//evil.com` and `/\evil.com` are protocol-relative URLs, not local paths.
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
