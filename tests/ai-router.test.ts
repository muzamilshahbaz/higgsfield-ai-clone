import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODELS } from '@/lib/ai/registry'
import { PROVIDERS, getProvider, isConnectableProvider, keyShapeWarning } from '@/lib/ai/catalogue'
import { signKlingToken, splitKlingCredential } from '@/services/ai/providers/kling'

/**
 * The router reads AI_ENABLE_DIRECT_PROVIDERS once at import time, so each
 * case resets the module registry and re-imports — same technique as
 * provider-resolution.test.ts.
 */
async function routerWith(enabled: boolean) {
  vi.resetModules()
  if (enabled) process.env.AI_ENABLE_DIRECT_PROVIDERS = '1'
  else delete process.env.AI_ENABLE_DIRECT_PROVIDERS
  return import('@/services/ai/ai-router')
}

let saved: string | undefined

beforeEach(() => {
  saved = process.env.AI_ENABLE_DIRECT_PROVIDERS
})

afterEach(() => {
  if (saved === undefined) delete process.env.AI_ENABLE_DIRECT_PROVIDERS
  else process.env.AI_ENABLE_DIRECT_PROVIDERS = saved
  vi.resetModules()
})

describe('routeGeneration', () => {
  it('always returns a runnable driver, for every registered model', async () => {
    const { routeGeneration } = await routerWith(false)

    for (const model of MODELS) {
      const route = routeGeneration({ modelId: model.id })
      expect(typeof route.driver.submit, model.id).toBe('function')
      expect(typeof route.driver.poll, model.id).toBe('function')
    }
  })

  it('falls back to mock rather than throwing for an unknown model', async () => {
    const { routeGeneration } = await routerWith(false)
    const route = routeGeneration({ modelId: 'no-such-model' })

    expect(route.providerName).toBe('mock')
    expect(route.keySource).toBe('none')
    expect(route.fallbackReason).toMatch(/unknown model/)
  })

  it('records the vendor the model wanted even when it falls back', async () => {
    const { routeGeneration } = await routerWith(false)
    const route = routeGeneration({ modelId: 'kling-v2-pro' })

    expect(route.intendedProvider).toBe('kling')
    expect(route.providerName).toBe('mock')
  })

  it('ignores a user key while direct providers are disabled', async () => {
    // The safety default: a stored key must not silently start spending at a
    // vendor the operator has not switched on.
    const { routeGeneration } = await routerWith(false)
    const route = routeGeneration({ modelId: 'flux-pro', userKey: 'sk-a-real-looking-key' })

    expect(route.providerName).toBe('mock')
    expect(route.keySource).toBe('none')
    expect(route.fallbackReason).toMatch(/direct providers disabled/i)
  })

  it('reports the missing driver, not the missing key, once enabled', async () => {
    const { routeGeneration, canGenerateWith } = await routerWith(true)
    const route = routeGeneration({ modelId: 'flux-pro', userKey: 'sk-a-real-looking-key' })

    // No vendor ships a createDriver in this build, so every route still
    // lands on mock — but for a reason an operator can act on.
    expect(canGenerateWith('flux')).toBe(false)
    expect(route.fallbackReason).toMatch(/no generation driver/i)
  })

  it('never reports a key source it did not actually use', async () => {
    const { routeGeneration } = await routerWith(true)

    for (const model of MODELS) {
      const route = routeGeneration({ modelId: model.id, userKey: 'some-key' })
      if (route.providerName === 'mock') expect(route.keySource, model.id).toBe('none')
    }
  })

  it('treats a whitespace-only user key as no key at all', async () => {
    const { routeGeneration } = await routerWith(true)
    const route = routeGeneration({ modelId: 'flux-pro', userKey: '   ' })
    expect(route.keySource).toBe('none')
  })
})

describe('verifyProviderKey', () => {
  it('returns a status rather than throwing when a driver blows up', async () => {
    const { verifyProviderKey } = await routerWith(false)
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
    const { verifyProviderKey } = await routerWith(false)
    const result = await verifyProviderKey('mock', 'anything')
    expect(result.status).toBe('unverified')
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

  it('has a catalogue entry for every vendor the registry points at', () => {
    for (const model of MODELS) {
      if (model.provider === 'mock') continue
      expect(getProvider(model.provider), `${model.id} -> ${model.provider}`).toBeDefined()
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
    expect(isConnectableProvider('mock')).toBe(false)
    expect(isConnectableProvider('__proto__')).toBe(false)
    expect(isConnectableProvider('')).toBe(false)
  })
})

describe('keyShapeWarning', () => {
  const openai = getProvider('openai')!

  it('passes a plausible key', () => {
    expect(keyShapeWarning(openai, 'sk-proj-abcdefghijklmnopqrstuv')).toBeNull()
  })

  it('flags a key that is too short', () => {
    expect(keyShapeWarning(openai, 'sk-abc')).toMatch(/too short/i)
  })

  it('flags a key that does not match the vendor prefix', () => {
    expect(keyShapeWarning(openai, 'r8_abcdefghijklmnopqrstuv')).toMatch(/usually look like/i)
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
