import { z } from 'zod'

/**
 * Profile input schema.
 *
 * The handle rule is the one that matters: it is the public identifier on
 * Explore bylines, it is compared case-insensitively by the
 * `profiles_handle_lower_key` index, and the Server Action lowercases before
 * writing — so the form has to reject anything that index would collapse.
 */

export const HANDLE_MIN = 3
export const HANDLE_MAX = 24

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(48, 'Use 48 characters or fewer.')
    .optional()
    .or(z.literal('')),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(HANDLE_MIN, `Use at least ${HANDLE_MIN} characters.`)
    .max(HANDLE_MAX, `Use ${HANDLE_MAX} characters or fewer.`)
    .regex(
      /^[a-z0-9_]+$/,
      'Handles use lowercase letters, numbers and underscores only.',
    ),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
