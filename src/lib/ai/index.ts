import { env } from '@/lib/env'
import { MockProvider } from '@/lib/ai/providers/mock'
import type { AIProvider } from '@/lib/ai/types'
import type { ProviderName } from '@/types/database'

export * from '@/lib/ai/types'
export * from '@/lib/ai/registry'
export * from '@/lib/ai/catalogue'

const mock = new MockProvider()

/**
 * Picks the active AGGREGATOR driver from AI_PROVIDER.
 *
 * This is the build-wide default, and it answers a different question from
 * services/ai/ai-router.ts. The router decides per job, using the model the
 * user picked and the key that user connected; this decides what an operator
 * configured for everyone. Generation goes through the router. What is left
 * here is the health endpoint and the aggregator fallback the router reports.
 *
 * Falls back to the mock driver whenever the selected provider has no key, so a
 * fresh clone with an empty .env.local still runs the entire product instead of
 * failing at the first Generate click.
 *
 * Adding a real aggregator driver is two steps:
 *   1. implement AIProvider in lib/ai/providers/<name>.ts
 *   2. add its case below
 * Adding a DIRECT vendor is a different path: an entry in lib/ai/catalogue.ts
 * and a module in services/ai/providers/. Neither touches a preset, a
 * component or a database row.
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
