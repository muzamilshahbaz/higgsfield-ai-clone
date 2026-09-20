/**
 * Publishes a handful of finished shots so a fresh deployment has something
 * in Explore.
 *
 *   npm run seed:demo -- --email you@example.com
 *
 * The account must already exist — sign up through the app first. Demo rows
 * are attributed to that user, so the walkthrough in the README has real work
 * to like and remix.
 *
 * Two rules this script will not break:
 *
 *   1. `credit_cost` is 0 and no ledger row is written. Demo content is not a
 *      job that ran, and inserting a cost without a matching debit would break
 *      the invariant the whole credits system rests on — that the ledger sums
 *      to the balance.
 *   2. Every row is keyed by a deterministic `idempotency_key`, so re-running
 *      updates in place instead of filling the feed with duplicates.
 */
import { resolve } from 'node:path'

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import { getModel } from '../src/lib/ai/registry'
import type { Database } from '../src/types/database'

config({ path: resolve(process.cwd(), '.env.local') })

const SAMPLES = [
  {
    key: 'rain-window',
    prompt: 'a detective at a rain-streaked window, venetian blinds, 1940s',
    presetSlug: 'film-noir',
    modelId: 'lumen-pro',
    aspect: '16:9',
    asset: '/samples/shot-01.svg',
  },
  {
    key: 'neon-tram',
    prompt: 'an empty tram at night, rain on the glass, neon reflections',
    presetSlug: 'cyberpunk-neon',
    modelId: 'lumen-flash',
    aspect: '16:9',
    asset: '/samples/shot-02.svg',
  },
  {
    key: 'golden-cliff',
    prompt: 'a lone figure on a cliff edge at golden hour, long lens',
    presetSlug: 'golden-hour',
    modelId: 'lumen-pro',
    aspect: '21:9',
    asset: '/samples/shot-03.svg',
  },
  {
    key: 'market-portrait',
    prompt: 'a street vendor lit by a single bulb, shallow depth of field',
    presetSlug: 'polaroid',
    modelId: 'lumen-flash',
    aspect: '4:5',
    asset: '/samples/shot-04.svg',
  },
  {
    key: 'desert-road',
    prompt: 'a desert highway vanishing into heat haze, anamorphic flare',
    presetSlug: '35mm-film',
    modelId: 'lumen-pro',
    aspect: '21:9',
    asset: '/samples/shot-05.svg',
  },
  {
    key: 'studio-orbit',
    prompt: 'a ceramic vase on a plinth, seamless studio backdrop',
    presetSlug: 'fashion-editorial',
    modelId: 'lumen-flash',
    aspect: '1:1',
    asset: '/samples/shot-06.svg',
  },
] as const

function argValue(name: string): string | undefined {
  const flag = `--${name}`
  const index = process.argv.indexOf(flag)
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1]

  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`))
  return inline?.slice(flag.length + 1)
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

async function main() {
  const email = argValue('email')
  if (!email) {
    fail('Usage: npm run seed:demo -- --email you@example.com')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url, email')
    .ilike('email', email)
    .maybeSingle()

  if (profileError) fail(`Could not read profiles: ${profileError.message}`)
  if (!profile) fail(`No account found for ${email}. Sign up in the app first, then re-run.`)

  const { data: projectId, error: projectError } = await admin.rpc('ensure_default_project', {
    p_user_id: profile.id,
  })
  if (projectError) fail(`Could not resolve a project: ${projectError.message}`)

  const { data: presets } = await admin
    .from('presets')
    .select('id, slug')
    .in('slug', SAMPLES.map((sample) => sample.presetSlug))

  const presetBySlug = new Map((presets ?? []).map((preset) => [preset.slug, preset.id]))

  let created = 0
  let updated = 0
  let skipped = 0

  for (const sample of SAMPLES) {
    const model = getModel(sample.modelId)
    if (!model) {
      console.warn(`  skipped ${sample.key}: model ${sample.modelId} is not in the registry`)
      skipped += 1
      continue
    }

    const idempotencyKey = `demo:${profile.id}:${sample.key}`

    const { data: existing } = await admin
      .from('generations')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    const row = {
      user_id: profile.id,
      project_id: projectId,
      preset_id: presetBySlug.get(sample.presetSlug) ?? null,
      author_handle: profile.handle,
      author_name: profile.display_name,
      author_avatar_url: profile.avatar_url,
      task: model.task,
      status: 'succeeded' as const,
      progress: 1,
      prompt: sample.prompt,
      resolved_prompt: sample.prompt,
      model_id: model.id,
      provider: 'mock' as const,
      aspect_ratio: sample.aspect,
      // Zero, deliberately: see the header. No ledger row is written.
      credit_cost: 0,
      visibility: 'public' as const,
      idempotency_key: idempotencyKey,
      completed_at: new Date().toISOString(),
    }

    if (existing) {
      const { error } = await admin.from('generations').update(row).eq('id', existing.id)
      if (error) {
        console.warn(`  failed ${sample.key}: ${error.message}`)
        skipped += 1
        continue
      }
      updated += 1
      continue
    }

    const { data: inserted, error } = await admin
      .from('generations')
      .insert(row)
      .select('id')
      .single()

    if (error || !inserted) {
      console.warn(`  failed ${sample.key}: ${error?.message}`)
      skipped += 1
      continue
    }

    const { error: assetError } = await admin.from('assets').insert({
      generation_id: inserted.id,
      user_id: profile.id,
      kind: 'image',
      url: sample.asset,
      mime_type: 'image/svg+xml',
      sort_order: 0,
    })

    if (assetError) console.warn(`  ${sample.key}: media row failed — ${assetError.message}`)
    created += 1
  }

  console.log(
    `\n  Demo content for ${email}: ${created} created, ${updated} updated, ${skipped} skipped.\n` +
      `  Open /explore to see them.\n`,
  )
}

main().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
