import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PROVIDERS } from '@/lib/ai/catalogue'
import type { ProviderName } from '@/types/database'

/**
 * `env` is a frozen object built once at import time, so every case here resets
 * the module registry and re-imports to get a freshly evaluated copy.
 *
 * This file used to test `resolveProvider()`, a build-wide AI_PROVIDER default.
 * That is gone: which provider runs a job is a per-job question answered by the
 * router from the model and the user's connected keys, and a second answer
 * living in the environment was a way for the two to disagree. What is left
 * here is the part that still matters — how a shared operator key is read.
 */
async function freshEnv(vars: Record<string, string | undefined> = {}) {
  vi.resetModules()
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return import('@/lib/env')
}

const KEYS = [
  'HUGGINGFACE_API_KEY',
  'FAL_KEY',
  'REPLICATE_API_TOKEN',
  'BFL_API_KEY',
  'STABILITY_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'KLING_API_KEY',
  'RUNWAY_API_KEY',
  'LUMA_API_KEY',
  'PIKA_API_KEY',
] as const

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

describe('serverProviderKey', () => {
  it('reads the shared key for each of the three generation providers', async () => {
    const { serverProviderKey } = await freshEnv({
      HUGGINGFACE_API_KEY: 'hf_shared',
      FAL_KEY: 'fal_shared',
      REPLICATE_API_TOKEN: 'r8_shared',
    })

    expect(serverProviderKey('huggingface')).toBe('hf_shared')
    expect(serverProviderKey('fal')).toBe('fal_shared')
    expect(serverProviderKey('replicate')).toBe('r8_shared')
  })

  it('returns undefined for a provider with no shared key configured', async () => {
    const { serverProviderKey } = await freshEnv(
      Object.fromEntries(KEYS.map((key) => [key, undefined])),
    )

    for (const provider of PROVIDERS) {
      expect(serverProviderKey(provider.id), provider.id).toBeUndefined()
    }
  })

  it('never returns a key for the mock provider', async () => {
    const { serverProviderKey } = await freshEnv({ FAL_KEY: 'fal_shared' })
    expect(serverProviderKey('mock')).toBeUndefined()
  })

  it('has a case for every provider name, so a new vendor cannot be forgotten', async () => {
    const { serverProviderKey } = await freshEnv()

    // The switch is exhaustive at the type level; this proves it does not throw
    // at runtime for any member of the union, including the ones added last.
    const all: ProviderName[] = ['mock', ...PROVIDERS.map((provider) => provider.id)]
    for (const provider of all) {
      expect(() => serverProviderKey(provider), provider).not.toThrow()
    }
  })

  it('treats a whitespace-only shared key as absent', async () => {
    const { serverProviderKey } = await freshEnv({ FAL_KEY: '   ' })
    expect(serverProviderKey('fal')).toBeUndefined()
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

  it('keeps the key vault shut without an encryption secret', async () => {
    vi.resetModules()
    const savedSecret = process.env.AI_KEY_ENCRYPTION_SECRET
    delete process.env.AI_KEY_ENCRYPTION_SECRET

    try {
      const mod = await import('@/lib/env')
      expect(mod.isKeyVaultConfigured).toBe(false)
    } finally {
      if (savedSecret === undefined) delete process.env.AI_KEY_ENCRYPTION_SECRET
      else process.env.AI_KEY_ENCRYPTION_SECRET = savedSecret
      vi.resetModules()
    }
  })
})
