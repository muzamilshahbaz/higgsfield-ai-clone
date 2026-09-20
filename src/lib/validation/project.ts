import { z } from 'zod'

/**
 * Project input schemas.
 *
 * Shared by the dialogs and the Server Actions, so a title the form accepted
 * can never be refused by the server — and the length limits match the
 * `char_length(title) between 1 and 80` check in 0001_schema.sql, so a valid
 * form submission never reaches Postgres only to trip a constraint.
 */

export const PROJECT_TITLE_MAX = 80
export const PROJECT_DESCRIPTION_MAX = 280

const title = z
  .string()
  .trim()
  .min(1, 'Give the project a name.')
  .max(PROJECT_TITLE_MAX, `Use ${PROJECT_TITLE_MAX} characters or fewer.`)

const description = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX, `Use ${PROJECT_DESCRIPTION_MAX} characters or fewer.`)

export const createProjectSchema = z.object({
  title,
  description: description.optional().or(z.literal('')),
})

export const updateProjectSchema = z.object({
  id: z.string().uuid('That project does not exist.'),
  title: title.optional(),
  description: description.optional().or(z.literal('')),
  coverUrl: z.string().trim().max(2048).nullish(),
})

export const deleteProjectSchema = z.object({
  id: z.string().uuid('That project does not exist.'),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
