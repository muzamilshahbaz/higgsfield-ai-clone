import { z } from 'zod'

import { isConnectableProvider } from '@/lib/ai/catalogue'

/**
 * Provider key input.
 *
 * The provider is checked against the catalogue rather than against a literal
 * union, so adding a vendor to lib/ai/catalogue.ts does not require a second
 * edit here — and a provider that is not in the catalogue can never reach the
 * database, whatever a hand-rolled request body says.
 */

export const KEY_MIN = 8
export const KEY_MAX = 512
export const LABEL_MAX = 48

const providerSchema = z
  .string()
  .trim()
  .refine(isConnectableProvider, { message: 'That is not a provider you can connect.' })

export const saveProviderKeySchema = z.object({
  provider: providerSchema,
  /**
   * Not `.trim()` as a transform on its own: a key pasted with a trailing
   * newline is the single most common way this form gets a "rejected by the
   * vendor" that is nothing to do with the vendor.
   */
  apiKey: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(KEY_MIN, 'That is too short to be an API key.')
        .max(KEY_MAX, `Use ${KEY_MAX} characters or fewer.`),
    ),
  label: z
    .string()
    .trim()
    .max(LABEL_MAX, `Use ${LABEL_MAX} characters or fewer.`)
    .optional()
    .or(z.literal('')),
})

export const providerOnlySchema = z.object({ provider: providerSchema })

export type SaveProviderKeyInput = z.infer<typeof saveProviderKeySchema>
