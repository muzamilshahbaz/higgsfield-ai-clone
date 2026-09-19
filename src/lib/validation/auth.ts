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
 * Supabase enforces a 6-character minimum by default. We ask for 8 so the
 * server never rejects something the form accepted, and cap at 72 because
 * bcrypt silently truncates beyond that.
 */
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use 72 characters or fewer.')

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
