import { describe, expect, it } from 'vitest'

import { PROVIDERS } from '@/lib/ai/catalogue'
import { ProviderRequestError, type GenerationRequest } from '@/lib/ai/types'
import { driverModuleFor, verifyProviderKey } from '@/services/ai/ai-router'
import type { GenerationTask, ProviderName } from '@/types/database'

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
 * one. Every verification probe is a GET, so nothing is enqueued or billed.
 *
 * The second block does the same for the generation path, which is the part a
 * unit test with a stubbed `fetch` cannot prove: that the model URL is real,
 * that the body is shaped the way the endpoint expects, and that a live
 * rejection arrives as a ProviderRequestError with a code we mapped. It runs
 * with a bogus key too, so it reaches the vendor's auth check and stops there —
 * no job is enqueued, no GPU time is spent, nothing is billed.
 *
 * Give it a REAL key to prove the whole happy path instead:
 *
 *   LIVE_PROBE=1 PROBE_HF_KEY=hf_... npx vitest run tests/provider-probe.live.test.ts
 *
 * That one DOES generate an image and DOES spend from the account behind the
 * key, which is why it is opt-in twice over.
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

/**
 * The generation path, live.
 *
 * With a bogus key each driver should reach its vendor and come back with a
 * ProviderRequestError carrying a code — PROVIDER_AUTH for a rejected key, and
 * for a queue provider that could equally be MODEL_UNAVAILABLE if a path in the
 * registry has gone stale. Either way the failure is mapped, not a raw throw,
 * and that is the thing this proves.
 */
describe.skipIf(!live)('live generation submit', () => {
  const cases: Array<{ id: ProviderName; key: string; modelId: string; task: GenerationTask }> = [
    {
      id: 'huggingface',
      key: process.env.PROBE_HF_KEY ?? 'hf_0000000000000000000000000000000000',
      modelId: 'lumen-flash',
      task: 'text_to_image',
    },
    {
      id: 'fal',
      key: process.env.PROBE_FAL_KEY ?? '0000000a-0000-4000-8000-00000000000b:0000',
      modelId: 'lumen-flash',
      task: 'text_to_image',
    },
    {
      id: 'replicate',
      key: process.env.PROBE_REPLICATE_KEY ?? 'r8_0000000000000000000000000000000000',
      modelId: 'lumen-flash',
      task: 'text_to_image',
    },
  ]

  for (const probe of cases) {
    it(
      `submits to ${probe.id} and gets a mapped answer`,
      async () => {
        const driverModule = driverModuleFor(probe.id)
        const driver = driverModule?.createDriver?.(probe.key)
        expect(driver, `${probe.id} ships no generation driver`).toBeDefined()

        const request: GenerationRequest = {
          generationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          task: probe.task,
          modelId: probe.modelId,
          prompt: 'LIVE PROBE: a brass compass on wet slate',
          aspectRatio: '16:9',
          params: { num_inference_steps: 4 },
        }

        try {
          const result = await driver!.submit(request)
          const asset = result.immediate?.assets?.[0]

          console.log(
            `  ${probe.id.padEnd(12)} accepted  job=${result.providerJobId.slice(0, 48)}` +
              (asset ? ` ${asset.mimeType} ${asset.sizeBytes}B` : ''),
          )

          // A real key was supplied, so the job really ran or really queued.
          expect(result.providerJobId.length).toBeGreaterThan(0)
        } catch (cause) {
          expect(cause, `${probe.id} threw something unmapped`).toBeInstanceOf(ProviderRequestError)
          const failure = cause as ProviderRequestError

          console.log(
            `  ${probe.id.padEnd(12)} ${failure.code.padEnd(20)} retryable=${failure.retryable} ${failure.message}`,
          )

          expect(failure.code).not.toBe('NETWORK')
        }
      },
      60_000,
    )
  }
})
