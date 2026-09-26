/**
 * Seeds `media_assets`, and points the preset catalogue at it.
 *
 *   npx tsx scripts/seed-media.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and migration
 * 0011_media_assets.sql applied.
 *
 * Every url below was fetched and confirmed to return an image, and every
 * photograph was actually looked at before its `alt` was written — which is
 * how two of the first batch were caught and dropped as unusable. The alt text
 * describes what is in the frame and nothing else: none of this is output from
 * this app, and no surface may present it as such.
 *
 * Idempotent. Re-running upserts on `slug`, so fixing a description is an edit
 * here and one command.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

type Category = 'landscape' | 'person' | 'animal' | 'urban' | 'abstract' | 'still_life'

interface Seed {
  slug: string
  category: Category
  photoId: string
  alt: string
  tags: string[]
}

/** Unsplash CDN, cropped and re-encoded on their side from the query string. */
function url(photoId: string): string {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&h=675&q=75`
}

const SEEDS: Seed[] = [
  // ------------------------------------------------------------ landscape
  {
    slug: 'alpine-cloud',
    category: 'landscape',
    photoId: 'photo-1506905925346-21bda4d32df4',
    alt: 'Snow-covered peaks rising above a sea of cloud at sunset',
    tags: ['cinematic', 'wide', 'mountains', 'sunset'],
  },
  {
    slug: 'mist-cliffs',
    category: 'landscape',
    photoId: 'photo-1470071459604-3b5ec3a7fe05',
    alt: 'Green cliffs under low mist, sun breaking through heavy cloud',
    tags: ['cinematic', 'fog', 'wide'],
  },
  {
    slug: 'forest-path',
    category: 'landscape',
    photoId: 'photo-1441974231531-c6227db76b6e',
    alt: 'A path receding into a forest, warm light between the trunks',
    tags: ['depth', 'forest', 'warm'],
  },
  {
    slug: 'lake-reflection',
    category: 'landscape',
    photoId: 'photo-1493246507139-91e8fad9978e',
    alt: 'Turquoise mountain lake mirroring peaks lit by alpenglow',
    tags: ['cinematic', 'mountains', 'reflection'],
  },
  {
    slug: 'ocean-dusk',
    category: 'landscape',
    photoId: 'photo-1518837695005-2083093ee35b',
    alt: 'The surface of the sea at dusk, shallow depth of field',
    tags: ['macro', 'water', 'calm'],
  },
  {
    slug: 'breaking-wave',
    category: 'landscape',
    photoId: 'photo-1500375592092-40eb2168fd21',
    alt: 'A wave breaking in close-up, backlit by low golden sun',
    tags: ['motion', 'water', 'golden-hour'],
  },
  {
    slug: 'footbridge',
    category: 'landscape',
    photoId: 'photo-1447752875215-b2761acb3c5d',
    alt: 'A narrow footbridge leading straight into dense forest',
    tags: ['depth', 'symmetry', 'forest'],
  },
  {
    slug: 'valley-haze',
    category: 'landscape',
    photoId: 'photo-1506744038136-46273834b3fb',
    alt: 'A wide river valley between granite walls in dawn haze',
    tags: ['cinematic', 'wide', 'haze'],
  },
  {
    slug: 'night-sky',
    category: 'landscape',
    photoId: 'photo-1519681393784-d120267933ba',
    alt: 'The Milky Way and a shooting star over snow-covered mountains',
    tags: ['night', 'stars', 'cinematic'],
  },

  // --------------------------------------------------------------- person
  //
  // Faces, deliberately: a studio that sells camera moves and portrait presets
  // showing nothing but landscapes was the gap. These are stock portraits and
  // are never captioned as a user's published work.
  {
    slug: 'portrait-smiling-man',
    category: 'person',
    photoId: 'photo-1507003211169-0a1dd7228f2d',
    alt: 'A smiling man in a white t-shirt against a pale textured wall',
    tags: ['portrait', 'studio', 'warm'],
  },
  {
    slug: 'portrait-laughing-woman',
    category: 'person',
    photoId: 'photo-1494790108377-be9c29b29330',
    alt: 'A laughing woman in a red top, street background thrown out of focus',
    tags: ['portrait', 'candid', 'shallow-depth'],
  },
  {
    slug: 'portrait-lakeside',
    category: 'person',
    photoId: 'photo-1500648767791-00dcc994a43e',
    alt: 'A young woman with an auburn bob, calm water and hills behind her',
    tags: ['portrait', 'natural-light', 'outdoor'],
  },
  {
    slug: 'portrait-curly-hair',
    category: 'person',
    photoId: 'photo-1438761681033-6461ffad8d80',
    alt: 'A young man with curly hair in a white t-shirt against a pale wall',
    tags: ['portrait', 'studio', 'minimal'],
  },
  {
    slug: 'portrait-denim-blue-wall',
    category: 'person',
    photoId: 'photo-1552374196-c4e7ffc6e126',
    alt: 'A person in a denim jacket and grey hoodie against a painted blue wall',
    tags: ['portrait', 'street', 'colour-block'],
  },

  // --------------------------------------------------------------- animal
  {
    slug: 'retriever-puppy',
    category: 'animal',
    photoId: 'photo-1552053831-71594a27632d',
    alt: 'A golden retriever puppy sitting on paving, holding a flower in its mouth',
    tags: ['dog', 'outdoor', 'charming'],
  },
  {
    slug: 'hamster',
    category: 'animal',
    photoId: 'photo-1425082661705-1834bfd09dca',
    alt: 'A pale hamster sitting upright on a kitchen counter',
    tags: ['small', 'indoor', 'macro'],
  },
  {
    slug: 'pug-scarf',
    category: 'animal',
    photoId: 'photo-1517849845537-4d257902454a',
    alt: 'A black pug wearing a knitted scarf against a yellow background',
    tags: ['dog', 'studio', 'colour-block'],
  },
  {
    slug: 'street-puppies',
    category: 'animal',
    photoId: 'photo-1444212477490-ca407925329e',
    alt: 'Three tan puppies standing together on a gravel road',
    tags: ['dog', 'outdoor', 'group'],
  },
  {
    slug: 'penguins',
    category: 'animal',
    photoId: 'photo-1441057206919-63d19fac2369',
    alt: 'Two penguins standing on a weathered granite boulder under a pale sky',
    tags: ['wildlife', 'coast', 'wide'],
  },
  {
    slug: 'red-fox',
    category: 'animal',
    photoId: 'photo-1474511320723-9a56873867b5',
    alt: 'A red fox standing in snow, lit by low winter sun',
    tags: ['wildlife', 'snow', 'golden-hour'],
  },

  // ---------------------------------------------------------------- urban
  {
    slug: 'city-sunset-skyline',
    category: 'urban',
    photoId: 'photo-1480714378408-67cf0d13bc1b',
    alt: 'A dense city skyline from above, sun setting along an avenue',
    tags: ['city', 'golden-hour', 'wide'],
  },
  {
    slug: 'city-avenue',
    category: 'urban',
    photoId: 'photo-1449824913935-59a10b8d2000',
    alt: 'A wide city avenue lined with traffic lights and tall buildings',
    tags: ['city', 'street', 'depth'],
  },
  {
    slug: 'city-dusk-wet-road',
    category: 'urban',
    photoId: 'photo-1519501025264-65ba15a82390',
    alt: 'A city street at dusk, car lights reflecting off a wet road',
    tags: ['city', 'night', 'cinematic', 'reflection'],
  },
  {
    slug: 'neon-sign',
    category: 'urban',
    photoId: 'photo-1496449903678-68ddcb189a24',
    alt: 'A pink neon sign reading "this is the sign you have been looking for" on a brick wall',
    tags: ['neon', 'night', 'interior'],
  },

  // ------------------------------------------------------------- abstract
  {
    slug: 'stage-lights',
    category: 'abstract',
    photoId: 'photo-1492684223066-81342ee5ff30',
    alt: 'Confetti falling through coloured stage light above a crowd',
    tags: ['light', 'motion', 'colour'],
  },
]

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const rows = SEEDS.map((seed, index) => ({
    slug: seed.slug,
    category: seed.category,
    url: url(seed.photoId),
    alt: seed.alt,
    width: 1200,
    height: 675,
    credit_name: 'Unsplash',
    credit_url: 'https://unsplash.com',
    tags: seed.tags,
    sort_order: index,
    is_active: true,
  }))

  const { error, count } = await supabase
    .from('media_assets')
    .upsert(rows, { onConflict: 'slug', count: 'exact' })

  if (error) {
    console.error('media_assets upsert failed:', error.message)
    if (error.message.includes('media_assets')) {
      console.error('Has migration 0011_media_assets.sql been applied?')
    }
    process.exit(1)
  }

  console.log(`media_assets: ${count ?? rows.length} rows`)
  for (const category of ['landscape', 'person', 'animal', 'urban', 'abstract'] as const) {
    console.log(`  ${category.padEnd(10)} ${SEEDS.filter((s) => s.category === category).length}`)
  }

  await repointPresets(supabase)
}

/**
 * Points every preset still holding a bundled placeholder at a real photograph.
 *
 * Done here rather than in the app, so the database is the source of truth and
 * nothing has to override a value at render time. A preset that already holds a
 * real preview — one somebody generated — is left alone.
 *
 * The assignment is by index rather than by meaning: these are reference
 * frames, and the page says so. Matching a photograph to a camera move would
 * imply the preset produces that shot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function repointPresets(supabase: any) {
  const { data: presets, error: readError } = await supabase
    .from('presets')
    .select('id, slug, preview_poster_url, preview_video_url')
    .order('sort_order', { ascending: true })

  if (readError) {
    console.error('preset read failed:', readError.message)
    return
  }

  const { data: media } = await supabase
    .from('media_assets')
    .select('url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const urls = ((media ?? []) as Array<{ url: string }>).map((row) => row.url)
  if (urls.length === 0) {
    console.error('no media assets to point presets at')
    return
  }

  const stale = (
    (presets ?? []) as Array<{
      id: string
      slug: string
      preview_poster_url: string | null
      preview_video_url: string | null
    }>
  ).filter(
    (preset) =>
      String(preset.preview_poster_url ?? '').startsWith('/samples/') ||
      String(preset.preview_video_url ?? '').startsWith('/samples/'),
  )

  let updated = 0
  for (const [index, preset] of stale.entries()) {
    const next = urls[index % urls.length]!
    const { error } = await supabase
      .from('presets')
      .update({ preview_poster_url: next, preview_video_url: next })
      .eq('id', preset.id)

    if (error) console.error(`  ${preset.slug}: ${error.message}`)
    else updated += 1
  }

  console.log(`presets repointed: ${updated} of ${(presets ?? []).length}`)
}

main().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
