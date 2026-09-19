import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * resolveProvider() reads the frozen `env` object, which is built once at
 * import time. To vary AI_PROVIDER per case we reset the module registry and
 * re-import, so each test gets a freshly evaluated env.
 */
async function resolveWith(vars: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const mod = await import('@/lib/ai/index')
  return { provider: mod.resolveProvider(), name: mod.activeProviderName() }
}

const KEYS = ['AI_PROVIDER', 'FAL_KEY', 'REPLICATE_API_TOKEN'] as const
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.resetModules()
})

describe('resolveProvider', () => {
  it('uses the mock driver when AI_PROVIDER is mock', async () => {
    const { provider, name } = await resolveWith({ AI_PROVIDER: 'mock' })
    expect(provider.name).toBe('mock')
    expect(name).toBe('mock')
  })

  it('defaults to mock when AI_PROVIDER is unset, so a fresh clone boots', async () => {
    const { provider } = await resolveWith({ AI_PROVIDER: undefined })
    expect(provider.name).toBe('mock')
  })

  it('falls back to mock when fal is selected but FAL_KEY is missing', async () => {
    const { provider } = await resolveWith({ AI_PROVIDER: 'fal', FAL_KEY: undefined })
    expect(provider.name).toBe('mock')
  })

  it('falls back to mock when replicate is selected but the token is missing', async () => {
    const { provider } = await resolveWith({
      AI_PROVIDER: 'replicate',
      REPLICATE_API_TOKEN: undefined,
    })
    expect(provider.name).toBe('mock')
  })

  it('falls back to mock for an unrecognised AI_PROVIDER rather than throwing', async () => {
    const { provider } = await resolveWith({ AI_PROVIDER: 'not-a-provider' })
    expect(provider.name).toBe('mock')
  })

  it('still returns a working driver while the real ones are unimplemented', async () => {
    // fal/replicate drivers are stubs in this phase: a key present must not
    // hand back a half-built provider that throws on the first submit.
    const { provider } = await resolveWith({ AI_PROVIDER: 'fal', FAL_KEY: 'fake-key' })
    expect(provider.name).toBe('mock')
    expect(typeof provider.submit).toBe('function')
    expect(typeof provider.poll).toBe('function')
  })

  it('warns once per missing key rather than on every resolve', async () => {
    vi.resetModules()
    process.env.AI_PROVIDER = 'fal'
    delete process.env.FAL_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mod = await import('@/lib/ai/index')
    mod.resolveProvider()
    mod.resolveProvider()
    mod.resolveProvider()

    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('env', () => {
  it('treats placeholder values from .env.example as unconfigured', async () => {
    vi.resetModules()
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://your-project-ref.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'your-anon-key'

    try {
      const mod = await import('@/lib/env')
      expect(mod.env.supabaseUrl).toBeUndefined()
      expect(mod.isSupabaseConfigured).toBe(false)
      expect(() => mod.requireSupabaseConfig()).toThrow(/not configured/i)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey
      vi.resetModules()
    }
  })

  it('treats whitespace-only values as unconfigured', async () => {
    vi.resetModules()
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = '   '

    try {
      const mod = await import('@/lib/env')
      expect(mod.env.supabaseServiceRoleKey).toBeUndefined()
      expect(mod.isServiceRoleConfigured).toBe(false)
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
      vi.resetModules()
    }
  })

  it('defaults the site url to localhost', async () => {
    vi.resetModules()
    const savedUrl = process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_SITE_URL

    try {
      const mod = await import('@/lib/env')
      expect(mod.env.siteUrl).toBe('http://localhost:3000')
    } finally {
      if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = savedUrl
      vi.resetModules()
    }
  })
})
