import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Storing a finished job's media.
 *
 * The case that matters here is new: Hugging Face answers with the image bytes
 * rather than a URL, so a driver hands over a `data:` URL and this is the only
 * thing standing between those bytes and a text column. Two rules have to hold.
 *
 *   1. Inline bytes are decoded and uploaded, and the row points at storage.
 *   2. If that upload fails there is NO fallback — the asset is dropped, so the
 *      generation service can fail the job and refund it. Keeping the data URL
 *      would write megabytes of base64 into a column every list query reads.
 */

const uploads: Array<{ path: string; contentType: string; size: number }> = []
const upserted: Array<Record<string, unknown>> = []

let uploadFails = false
let existingAssets: unknown[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: existingAssets, error: null }),
        }),
      }),
      upsert: (rows: Array<Record<string, unknown>>) => {
        upserted.push(...rows)
        return { select: () => Promise.resolve({ data: rows, error: null }) }
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, body: ArrayBuffer | Buffer, options: { contentType: string }) => {
          if (uploadFails) return Promise.resolve({ error: { message: 'bucket is gone' } })
          uploads.push({
            path,
            contentType: options.contentType,
            size: (body as { byteLength: number }).byteLength,
          })
          return Promise.resolve({ error: null })
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.test/generations/${path}` },
        }),
      }),
    },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({}),
  tryCreateClient: () => Promise.resolve(null),
  getCurrentUser: () => Promise.resolve(null),
}))

const GENERATION = { id: '33333333-3333-4333-8333-333333333333', user_id: 'user-1' }

/** A one-pixel PNG as a data URL, exactly as the Hugging Face driver returns. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const DATA_URL = `data:image/png;base64,${PNG_BASE64}`

beforeEach(() => {
  uploads.length = 0
  upserted.length = 0
  uploadFails = false
  existingAssets = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function persist(assets: Parameters<typeof import('@/services/asset.service')['persistProviderAssets']>[1]) {
  const { persistProviderAssets } = await import('@/services/asset.service')
  return persistProviderAssets(GENERATION, assets)
}

describe('inline provider bytes', () => {
  it('decodes a data url and uploads the real bytes', async () => {
    const rows = await persist([{ kind: 'image', url: DATA_URL, mimeType: 'image/png' }])

    expect(uploads).toHaveLength(1)
    expect(uploads[0]!.size).toBe(Buffer.from(PNG_BASE64, 'base64').byteLength)
    expect(uploads[0]!.contentType).toBe('image/png')
    expect(uploads[0]!.path).toBe('user-1/33333333-3333-4333-8333-333333333333/0-image.png')

    expect(rows).toHaveLength(1)
    expect(rows[0]!.url).toBe(`https://storage.test/generations/${uploads[0]!.path}`)
  })

  it('never lets a data url reach the database', async () => {
    await persist([{ kind: 'image', url: DATA_URL, mimeType: 'image/png' }])

    for (const row of upserted) {
      expect(String(row.url).startsWith('data:')).toBe(false)
    }
  })

  it('records the real byte size, not the base64 length', async () => {
    const rows = await persist([{ kind: 'image', url: DATA_URL, mimeType: 'image/png' }])
    expect(rows[0]!.size_bytes).toBe(Buffer.from(PNG_BASE64, 'base64').byteLength)
  })

  it('drops the asset when the upload fails, rather than storing base64', async () => {
    uploadFails = true

    const rows = await persist([{ kind: 'image', url: DATA_URL, mimeType: 'image/png' }])

    // Empty is the signal the generation service turns into STORAGE_FAILED and
    // a refund. A row here would be a card that says Ready over nothing.
    expect(rows).toEqual([])
    expect(upserted).toEqual([])
  })

  it('drops an undecodable payload rather than uploading nothing', async () => {
    const rows = await persist([{ kind: 'image', url: 'data:image/png;base64,', mimeType: 'image/png' }])

    expect(rows).toEqual([])
    expect(uploads).toEqual([])
  })
})

describe('provider urls', () => {
  it('copies a provider url into storage and points the row at the copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array(Buffer.from('a video')), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      ),
    )

    const rows = await persist([
      { kind: 'video', url: 'https://cdn.test/out.mp4', mimeType: 'video/mp4' },
    ])

    expect(rows[0]!.url).toContain('storage.test')
    expect(rows[0]!.storage_path).toBe('user-1/33333333-3333-4333-8333-333333333333/0-video.mp4')

    vi.unstubAllGlobals()
  })

  it('keeps the provider url when the copy fails, so the user still sees it', async () => {
    // Different from the inline case on purpose: this url works for an hour,
    // and an hour of a visible generation beats none.
    uploadFails = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array(Buffer.from('an image')), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    )

    const rows = await persist([{ kind: 'image', url: 'https://cdn.test/out.png' }])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.url).toBe('https://cdn.test/out.png')
    expect(rows[0]!.storage_path).toBeNull()

    vi.unstubAllGlobals()
  })

  it('leaves a same-origin sample alone, having nothing to copy', async () => {
    const rows = await persist([{ kind: 'image', url: '/samples/shot-01.svg' }])

    expect(uploads).toEqual([])
    expect(rows[0]!.url).toBe('/samples/shot-01.svg')
  })
})

describe('idempotency', () => {
  it('returns the existing rows rather than storing a second copy', async () => {
    existingAssets = [{ id: 'already-there', generation_id: GENERATION.id }]

    const rows = await persist([{ kind: 'image', url: DATA_URL, mimeType: 'image/png' }])

    expect(rows).toEqual(existingAssets)
    expect(uploads).toEqual([])
  })

  it('does nothing at all for a job that produced no media', async () => {
    const rows = await persist([])

    expect(rows).toEqual([])
    expect(uploads).toEqual([])
  })
})
