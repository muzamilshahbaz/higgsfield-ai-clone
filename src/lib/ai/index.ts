import { env } from '@/lib/env'
import { MockProvider } from '@/lib/ai/providers/mock'
import type { AIProvider } from '@/lib/ai/types'
import type { ProviderName } from '@/types/database'

export * from '@/lib/ai/types'
export * from '@/lib/ai/registry'

const mock = new MockProvider()

/**
 * Picks the active driver from AI_PROVIDER.
 *
 * Falls back to the mock driver whenever the selected provider has no key, so a
 * fresh clone with an empty .env.local still runs the entire product instead of
 * failing at the first Generate click.
 *
 * Adding a real provider is two steps:
 *   1. implement AIProvider in lib/ai/providers/<name>.ts
 *   2. add its case below
 * No preset, service, component or database row changes.
 */
export function resolveProvider(): AIProvider {
  switch (env.aiProvider) {
    case 'fal':
      if (!env.falKey) {
        warnOnce('fal', 'FAL_KEY')
        return mock
      }
      // return new FalProvider(env.falKey)
      warnOnce('fal', 'driver')
      return mock

    case 'replicate':
      if (!env.replicateToken) {
        warnOnce('replicate', 'REPLICATE_API_TOKEN')
        return mock
      }
      // return new ReplicateProvider(env.replicateToken)
      warnOnce('replicate', 'driver')
      return mock

    case 'mock':
    default:
      return mock
  }
}

/** The provider name to record on the generation row. */
export function activeProviderName(): ProviderName {
  return resolveProvider().name
}

const warned = new Set<string>()

function warnOnce(provider: string, missing: string) {
  const key = `${provider}:${missing}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    `[ai] AI_PROVIDER=${provider} but ${missing} is not available — falling back to the mock provider.`,
  )
}
