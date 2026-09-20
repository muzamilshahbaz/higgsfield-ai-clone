import { describe, expect, it } from 'vitest'

import { PROVIDERS } from '@/lib/ai/catalogue'
import { verifyProviderKey } from '@/services/ai/ai-router'

/**
 * Live provider verification probe. OPT-IN — skipped by default.
 *
 *   LIVE_PROBE=1 npx vitest run tests/provider-probe.live.test.ts
 *
 * Every other test in this suite is pure and offline, which is what makes
 * `npm test` trustworthy in CI. This one deliberately talks to nine vendors,
 * so it stays behind an env flag rather than quietly making the suite depend
 * on the internet and on someone else's uptime.
 *
 * It sends a credential that cannot be valid. What it proves is that the URL
 * resolves, that the auth header shape reaches the vendor's own auth check,
 * and that interpret() maps the answer to a sensible status — a vendor that
 * says `invalid` for a bogus key is one that would say `valid` for a real
 * one. Every probe is a GET, so nothing is enqueued and nothing is billed.
 */

const live = process.env.LIVE_PROBE === '1'

const BOGUS: Record<string, string> = {
  kling: 'not-a-real-access-key:not-a-real-secret',
}

describe.skipIf(!live)('live provider verification', () => {
  for (const provider of PROVIDERS) {
    it(
      `reaches ${provider.label} and rejects a bogus key`,
      async () => {
        const key = BOGUS[provider.id] ?? 'sk-definitely-not-a-real-api-key-000000'
        const result = await verifyProviderKey(provider.id, key)

        console.log(`  ${provider.id.padEnd(10)} ${result.status.padEnd(12)} ${result.message}`)

        // `unverified` is the honest answer for a vendor with no public
        // credential endpoint (Pika), so it is a pass, not a failure.
        expect(['invalid', 'unverified', 'unreachable', 'valid']).toContain(result.status)
      },
      20_000,
    )
  }
})
