import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODELS, providersFor, requireModel } from '@/lib/ai/registry'
import { PROVIDERS, getProvider, isConnectableProvider, keyShapeWarning } from '@/lib/ai/catalogue'
import { signKlingToken, splitKlingCredential } from '@/services/ai/providers/kling'
import type { ProviderName } from '@/types/database'

/**
 * The router reads AI_ALLOW_MOCK_FALLBACK once at import time, and reads the
 * shared provider keys from the environment on every call. So each case resets
 * the module registry, re-imports, and runs against an environment with no
 * shared keys at all — which is the state that proves a job with no key is
 * refused rather than quietly mocked.
 */
const SHARED_KEY_VARS = [
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

const TOUCHED = ['AI_ALLOW_MOCK_FALLBACK', ...SHARED_KEY_VARS] as const

async function routerWith({ mockFallback = false } = {}) {
  vi.resetModules()
  if (mockFallback) process.env.AI_ALLOW_MOCK_FALLBACK = '1'
  else delete process.env.AI_ALLOW_MOCK_FALLBACK
  for (const name of SHARED_KEY_VARS) delete process.env[name]
  return import('@/services/ai/ai-router')
}

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]))
})

afterEach(() => {
  for (const name of TOUCHED) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  vi.resetModules()
})

/** The providers this build ships a generation driver for. */
const READY: ProviderName[] = ['huggingface', 'fal', 'replicate']

/** The vendors that can verify a key but run nothing. */
const VERIFY_ONLY: ProviderName[] = [
  'flux',
  'stability',
  'openai',
  'google',
  'kling',
  'runway',
  'luma',
  'pika',
]

describe('canGenerateWith', () => {
  it('reports exactly the providers with a generation driver', async () => {
    const { canGenerateWith, generationProviders } = await routerWith()

    expect(generationProviders().sort()).toEqual([...READY].sort())
    for (const provider of READY) expect(canGenerateWith(provider), provider).toBe(true)
  })

  it('does not claim a driver for a vendor that only verifies keys', async () => {
    const { canGenerateWith } = await routerWith()

    for (const provider of VERIFY_ONLY) {
      expect(canGenerateWith(provider), provider).toBe(false)
    }
  })

  it('never reports the mock driver as a generation provider', async () => {
    const { canGenerateWith, generationProviders } = await routerWith()

    expect(canGenerateWith('mock')).toBe(false)
    expect(generationProviders()).not.toContain('mock')
  })
})

describe('routeGeneration', () => {
  it('refuses rather than mocking when the caller has no key at all', async () => {
    const { routeGeneration } = await routerWith()

    for (const model of MODELS) {
      const route = routeGeneration({ modelId: model.id })

      expect(route.ok, model.id).toBe(false)
      if (route.ok) continue

      expect(route.code, model.id).toBe('NO_PROVIDER_KEY')
      // The message has to be actionable: it names the model and where to go.
      expect(route.message, model.id).toContain(model.label)
      expect(route.message, model.id).toMatch(/AI model keys/i)
      expect(route.candidates, model.id).toEqual(providersFor(model))
    }
  })

  it('runs on the user key for the first provider when they have it', async () => {
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({
      modelId: 'lumen-flash',
      keys: { huggingface: 'hf_aaaaaaaaaaaaaaaaaaaaaaaa' },
    })

    expect(route.ok).toBe(true)
    if (!route.ok) return

    expect(route.providerName).toBe('huggingface')
    expect(route.keySource).toBe('user_key')
    expect(route.driver.name).toBe('huggingface')
  })

  it('falls through the route list to the provider the user does have', async () => {
    // The point of `routes`: a user with only a Replicate token still gets
    // FLUX.1 [schnell], on Replicate, with no second registry entry.
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({
      modelId: 'lumen-flash',
      keys: { replicate: 'r8_aaaaaaaaaaaaaaaaaaaaaaaa' },
    })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.providerName).toBe('replicate')
  })

  it('prefers the user key over the operator shared one', async () => {
    const { routeGeneration } = await routerWith()
    process.env.FAL_KEY = 'shared-fal-key'

    const route = routeGeneration({ modelId: 'motion-turbo', keys: { fal: 'user-fal-key' } })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.keySource).toBe('user_key')
  })

  it('uses the shared key for a user who has connected nothing', async () => {
    const { routeGeneration } = await routerWith()
    process.env.FAL_KEY = 'shared-fal-key'

    const route = routeGeneration({ modelId: 'motion-turbo' })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.providerName).toBe('fal')
    expect(route.keySource).toBe('server_key')
  })

  it('treats a whitespace-only user key as no key at all', async () => {
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({ modelId: 'lumen-flash', keys: { huggingface: '   ' } })

    expect(route.ok).toBe(false)
  })

  it('ignores a key for a provider that cannot serve the model', async () => {
    // Hugging Face runs no video in this build, so a token for it must not
    // make a video model look runnable.
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({
      modelId: 'motion-scene',
      keys: { huggingface: 'hf_aaaaaaaaaaaaaaaaaaaaaaaa' },
    })

    expect(route.ok).toBe(false)
    if (route.ok) return
    expect(route.candidates).not.toContain('huggingface')
  })

  it('refuses an unknown model instead of inventing a driver', async () => {
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({ modelId: 'no-such-model' })

    expect(route.ok).toBe(false)
    if (route.ok) return
    expect(route.code).toBe('UNKNOWN_MODEL')
  })

  it('pins a decision to one provider, for a job already in flight', async () => {
    // A user connects a Hugging Face token while a fal job is queued. The fal
    // request id must keep being polled against fal.
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({
      modelId: 'lumen-flash',
      keys: { huggingface: 'hf_aaaaaaaaaaaaaaaaaaaaaaaa', fal: 'user-fal-key' },
      only: 'fal',
    })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.providerName).toBe('fal')
  })

  it('refuses when the pinned provider has no key left', async () => {
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({
      modelId: 'lumen-flash',
      keys: { huggingface: 'hf_aaaaaaaaaaaaaaaaaaaaaaaa' },
      only: 'fal',
    })

    expect(route.ok).toBe(false)
  })

  it('always answers for the mock provider, so an old mock job still polls', async () => {
    const { routeGeneration } = await routerWith()
    const route = routeGeneration({ modelId: 'lumen-flash', only: 'mock' })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.driver.name).toBe('mock')
  })

  it('never claims a key source it did not use', async () => {
    const { routeGeneration } = await routerWith()

    for (const model of MODELS) {
      const route = routeGeneration({ modelId: model.id, keys: { fal: 'k' } })
      if (!route.ok) continue

      if (route.providerName === 'mock') expect(route.keySource, model.id).toBe('none')
      else expect(route.keySource, model.id).not.toBe('none')
    }
  })

  it('returns a runnable driver for every model once every key exists', async () => {
    const { routeGeneration } = await routerWith()
    const keys = { huggingface: 'hf_k', fal: 'fal_k', replicate: 'r8_k' }

    for (const model of MODELS) {
      const route = routeGeneration({ modelId: model.id, keys })

      expect(route.ok, model.id).toBe(true)
      if (!route.ok) continue

      expect(typeof route.driver.submit, model.id).toBe('function')
      expect(typeof route.driver.poll, model.id).toBe('function')
      expect(route.providerName, model.id).toBe(requireModel(model.id).routes[0]!.provider)
    }
  })
})

describe('AI_ALLOW_MOCK_FALLBACK', () => {
  it('is off by default, so nothing is ever silently faked', async () => {
    const { routingSummary } = await routerWith()
    expect(routingSummary().mockFallbackEnabled).toBe(false)
  })

  it('substitutes the mock driver only when explicitly turned on', async () => {
    const { routeGeneration } = await routerWith({ mockFallback: true })
    const route = routeGeneration({ modelId: 'lumen-flash' })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.providerName).toBe('mock')
    // Recorded so an operator reading the logs knows why a sample came back.
    expect(route.fallbackReason).toBeTruthy()
  })

  it('still prefers a real provider over the mock when a key exists', async () => {
    const { routeGeneration } = await routerWith({ mockFallback: true })
    const route = routeGeneration({ modelId: 'lumen-flash', keys: { huggingface: 'hf_k' } })

    expect(route.ok).toBe(true)
    if (!route.ok) return
    expect(route.providerName).toBe('huggingface')
  })
})

describe('routingSummary', () => {
  it('reports the providers it can generate with, by label', async () => {
    const { routingSummary } = await routerWith()
    const summary = routingSummary()

    expect(summary.generationProviders.sort()).toEqual([...READY].sort())
    expect(summary.generationProviderLabels).toContain('Hugging Face')
  })
})

describe('verifyProviderKey', () => {
  it('returns a status rather than throwing when a driver blows up', async () => {
    const { verifyProviderKey } = await routerWith()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network exploded')
      }),
    )

    const result = await verifyProviderKey('openai', 'sk-whatever')
    expect(['unreachable', 'invalid']).toContain(result.status)
    expect(result.message).toBeTruthy()

    vi.unstubAllGlobals()
  })

  it('reports unverified for a vendor with no verification module', async () => {
    const { verifyProviderKey } = await routerWith()
    const result = await verifyProviderKey('mock', 'anything')
    expect(result.status).toBe('unverified')
  })

  it('rejects an empty key without a network call, for every ready provider', async () => {
    const { verifyProviderKey } = await routerWith()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    for (const provider of READY) {
      const result = await verifyProviderKey(provider, '   ')
      expect(result.status, provider).toBe('invalid')
    }

    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('provider catalogue', () => {
  it('has a unique id per provider', () => {
    const ids = PROVIDERS.map((provider) => provider.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never lists the mock driver as something to connect', () => {
    expect(PROVIDERS.some((provider) => provider.id === 'mock')).toBe(false)
  })

  it('has a catalogue entry for every provider the registry routes to', () => {
    for (const model of MODELS) {
      for (const provider of providersFor(model)) {
        expect(getProvider(provider), `${model.id} -> ${provider}`).toBeDefined()
      }
    }
  })

  it('marks a provider generation-ready only when a model actually routes to it', () => {
    const routed = new Set(MODELS.flatMap((model) => providersFor(model)))

    for (const provider of PROVIDERS) {
      expect(provider.generationReady, provider.id).toBe(routed.has(provider.id))
    }
  })

  it('offers a console url and a placeholder for every provider', () => {
    for (const provider of PROVIDERS) {
      expect(provider.consoleUrl, provider.id).toMatch(/^https:\/\//)
      expect(provider.keyPlaceholder.length, provider.id).toBeGreaterThan(0)
    }
  })

  it('recognises its own ids and rejects anything else', () => {
    expect(isConnectableProvider('openai')).toBe(true)
    expect(isConnectableProvider('huggingface')).toBe(true)
    expect(isConnectableProvider('mock')).toBe(false)
    expect(isConnectableProvider('__proto__')).toBe(false)
    expect(isConnectableProvider('')).toBe(false)
  })
})

describe('keyShapeWarning', () => {
  const openai = getProvider('openai')!
  const hugging = getProvider('huggingface')!

  it('passes a plausible key', () => {
    expect(keyShapeWarning(openai, 'sk-proj-abcdefghijklmnopqrstuv')).toBeNull()
    expect(keyShapeWarning(hugging, 'hf_abcdefghijklmnopqrstuvwx')).toBeNull()
  })

  it('flags a key that is too short', () => {
    expect(keyShapeWarning(openai, 'sk-abc')).toMatch(/too short/i)
  })

  it('flags a key that does not match the vendor prefix', () => {
    expect(keyShapeWarning(openai, 'r8_abcdefghijklmnopqrstuv')).toMatch(/usually look like/i)
    expect(keyShapeWarning(hugging, 'sk-abcdefghijklmnopqrstuv')).toMatch(/usually look like/i)
  })

  it('flags an embedded space', () => {
    expect(keyShapeWarning(openai, 'sk-abcdefghij klmnopqrstu')).toMatch(/space/i)
  })
})

describe('kling credentials', () => {
  it('splits on the first colon only', () => {
    expect(splitKlingCredential('access:secret:with:colons')).toEqual({
      accessKey: 'access',
      secret: 'secret:with:colons',
    })
  })

  it('rejects a credential missing either half', () => {
    expect(splitKlingCredential('no-colon-here')).toBeNull()
    expect(splitKlingCredential(':secret-only')).toBeNull()
    expect(splitKlingCredential('access-only:')).toBeNull()
  })

  it('signs a three-segment JWT whose payload carries the access key', () => {
    const token = signKlingToken('my-access-key', 'my-secret', 1_700_000_000)
    const [header, payload, signature] = token.split('.')

    expect(signature).toBeTruthy()
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    })

    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString())
    expect(claims.iss).toBe('my-access-key')
    expect(claims.nbf).toBeLessThan(1_700_000_000)
    expect(claims.exp).toBeGreaterThan(1_700_000_000)
  })

  it('never puts the secret in the token', () => {
    const token = signKlingToken('access', 'the-actual-secret', 1_700_000_000)
    expect(token).not.toContain('the-actual-secret')
  })

  it('produces base64url, with no characters that need escaping in a header', () => {
    const token = signKlingToken('access', 'secret+/=value', 1_700_000_000)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })
})
