/**
 * Seeds the preset catalog from data/presets.json.
 *
 *   npm run seed
 *
 * Idempotent: presets are upserted on `slug`, so re-running after editing the
 * JSON updates rows in place rather than duplicating them. Any preset in the
 * database whose slug is no longer in the file is deactivated rather than
 * deleted, so existing generations keep their foreign key.
 *
 * Uses the service-role client because `presets` is read-only to end users.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { getModel } from '../src/lib/ai/registry'
import type { Database } from '../src/types/database'

config({ path: resolve(process.cwd(), '.env.local') })

const presetSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['motion', 'style']),
  category: z.string().min(1),
  promptFragment: z.string().min(1),
  negativePrompt: z.string().optional(),
  modelId: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  previewVideoUrl: z.string().optional(),
  previewPosterUrl: z.string().optional(),
  accent: z.string().optional(),
  creditCost: z.number().int().min(0).default(0),
  sortOrder: z.number().int().default(0),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

type Preset = z.infer<typeof presetSchema>

function loadPresets(): Preset[] {
  const path = resolve(process.cwd(), 'data/presets.json')
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))

  const parsed = z.array(presetSchema).safeParse(raw)
  if (!parsed.success) {
    console.error('data/presets.json failed validation:\n')
    for (const issue of parsed.error.issues.slice(0, 20)) {
      console.error(`  [${issue.path.join('.')}] ${issue.message}`)
    }
    process.exit(1)
  }

  const presets = parsed.data

  const slugs = new Set<string>()
  for (const preset of presets) {
    if (slugs.has(preset.slug)) {
      console.error(`Duplicate slug in data/presets.json: ${preset.slug}`)
      process.exit(1)
    }
    slugs.add(preset.slug)
  }

  // A preset pointing at a model that does not exist would fail only at
  // generation time, which is far too late to find out.
  const unknownModels = presets.filter((preset) => !getModel(preset.modelId))
  if (unknownModels.length > 0) {
    console.error('Presets reference models missing from lib/ai/registry.ts:\n')
    for (const preset of unknownModels) {
      console.error(`  ${preset.slug} -> ${preset.modelId}`)
    }
    process.exit(1)
  }

  return presets
}

function toRow(preset: Preset) {
  return {
    slug: preset.slug,
    title: preset.title,
    description: preset.description ?? null,
    kind: preset.kind,
    category: preset.category,
    prompt_fragment: preset.promptFragment,
    negative_prompt: preset.negativePrompt ?? null,
    model_id: preset.modelId,
    params: preset.params as Database['public']['Tables']['presets']['Insert']['params'],
    preview_video_url: preset.previewVideoUrl ?? null,
    preview_poster_url: preset.previewPosterUrl ?? null,
    accent: preset.accent ?? null,
    credit_cost: preset.creditCost,
    sort_order: preset.sortOrder,
    is_featured: preset.isFeatured,
    is_active: preset.isActive,
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    console.error(
      'Missing configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
    )
    process.exit(1)
  }

  const presets = loadPresets()
  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`Seeding ${presets.length} presets...`)

  const { data: before, error: beforeError } = await supabase.from('presets').select('slug')
  if (beforeError) {
    console.error(`Could not read existing presets: ${beforeError.message}`)
    process.exit(1)
  }
  const existing = new Set((before ?? []).map((row) => row.slug))

  const { data: upserted, error: upsertError } = await supabase
    .from('presets')
    .upsert(presets.map(toRow), { onConflict: 'slug' })
    .select('slug')

  if (upsertError) {
    console.error(`Seed failed: ${upsertError.message}`)
    process.exit(1)
  }

  const written = upserted ?? []
  const inserted = written.filter((row) => !existing.has(row.slug)).length
  const updated = written.length - inserted

  // Retire anything no longer in the file, without breaking existing rows.
  const currentSlugs = presets.map((preset) => preset.slug)
  const stale = [...existing].filter((slug) => !currentSlugs.includes(slug))

  let deactivated = 0
  if (stale.length > 0) {
    const { data: retired, error: retireError } = await supabase
      .from('presets')
      .update({ is_active: false })
      .in('slug', stale)
      .select('slug')

    if (retireError) {
      console.error(`Could not deactivate stale presets: ${retireError.message}`)
      process.exit(1)
    }
    deactivated = (retired ?? []).length
  }

  const motion = presets.filter((preset) => preset.kind === 'motion').length
  const style = presets.length - motion
  const featured = presets.filter((preset) => preset.isFeatured).length

  console.log('')
  console.log(`  inserted     ${inserted}`)
  console.log(`  updated      ${updated}`)
  console.log(`  deactivated  ${deactivated}`)
  console.log('')
  console.log(`  ${motion} motion, ${style} style, ${featured} featured`)
  console.log('')
  console.log('Done.')
}

main().catch((error: unknown) => {
  console.error('Seed crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
