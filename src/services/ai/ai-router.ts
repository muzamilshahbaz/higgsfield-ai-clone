import 'server-only'

import { MockProvider } from '@/lib/ai/providers/mock'
import { getModel, type ModelEntry } from '@/lib/ai/registry'
import { getProvider } from '@/lib/ai/catalogue'
import type { AIProvider } from '@/lib/ai/types'
import { env, serverProviderKey } from '@/lib/env'
import type { ProviderName } from '@/types/database'

import type { ProviderDriverModule, VerifyResult } from './providers/base'
import fal from './providers/fal'
import flux from './providers/flux'
import google from './providers/google'
import kling from './providers/kling'
import luma from './providers/luma'
import openai from './providers/openai'
import pika from './providers/pika'
import replicate from './providers/replicate'
import runway from './providers/runway'
import stability from './providers/stability'

/**
 * The AI router.
 *
 * One question, asked in one place: given the model a user picked, which
 * driver runs the job and whose credential pays for it?
 *
 *   1. The model names its vendor      (lib/ai/registry.ts)
 *   2. The user's own key for that vendor, if they connected one
 *   3. The operator's shared key for that vendor, if one is configured
 *   4. The mock driver
 *
 * Steps 2 and 3 only matter when a real driver for the vendor exists in this
 * build. A vendor whose module has no `createDriver` cannot run a job however
 * many valid keys point at it, so the router reports that honestly rather
 * than routing into a throw.
 *
 * Everything in here is a pure function of its arguments plus the environment.
 * Fetching the user's key is the caller's job (services/ai-keys.service.ts),
 * which keeps this module free of Supabase and therefore unit-testable.
 */

const MODULES: Record<ProviderName, ProviderDriverModule | null> = {
  mock: null,
  fal,
  replicate,
  flux,
  stability,
  openai,
  google,
  kling,
  runway,
  luma,
  pika,
}

const mock = new MockProvider()

/** Where the credential that will run this job came from. */
export type KeySource = 'user_key' | 'server_key' | 'none'

export interface RouteDecision {
  driver: AIProvider
  /** Recorded on the generation row, so history says who actually ran it. */
  providerName: ProviderName
  /** The vendor the model wanted, which may differ from `providerName`. */
  intendedProvider: ProviderName
  keySource: KeySource
  /** Present when the job fell back; written to the log, not to the user. */
  fallbackReason?: string
}

/**
 * Direct-vendor drivers are opt-in.
 *
 * None of the per-vendor generation drivers in this build have been exercised
 * against a live account, and a wrong request shape does not fail politely —
 * it fails after the credit debit, on a user's own quota. Default off means
 * the worst case is a mock render; an operator who wants to wire a vendor up
 * sets AI_ENABLE_DIRECT_PROVIDERS=1 and takes that on deliberately.
 */
const directProvidersEnabled = process.env.AI_ENABLE_DIRECT_PROVIDERS === '1'

/** The verification module for a vendor, or null if it has none. */
export function driverModuleFor(provider: ProviderName): ProviderDriverModule | null {
  return MODULES[provider] ?? null
}

/** Can this build run a real job through this vendor? */
export function canGenerateWith(provider: ProviderName): boolean {
  if (!directProvidersEnabled) return false
  return typeof MODULES[provider]?.createDriver === 'function'
}

/**
 * Asks a vendor whether a credential is real.
 *
 * Never throws: a verification failure is a status to display, not an
 * exception to handle, and the key is stored either way.
 */
export async function verifyProviderKey(
  provider: ProviderName,
  rawKey: string,
): Promise<VerifyResult> {
  const driverModule = MODULES[provider]
  const label = getProvider(provider)?.label ?? provider

  if (!driverModule) {
    return { status: 'unverified', message: `${label} cannot be verified from this build.` }
  }

  try {
    return await driverModule.verifyKey(rawKey)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    console.error(`[ai-router] verify failed for ${provider}:`, message)
    return {
      status: 'unreachable',
      message: `Could not check the key with ${label}. It was saved unverified.`,
    }
  }
}

export interface RouteInput {
  /** Registry id the user picked in the composer. */
  modelId: string
  /** The user's decrypted key for the model's vendor, when they have one. */
  userKey?: string | null
}

/**
 * Picks the driver for one job.
 *
 * Always returns something runnable. There is no failure mode here: a model
 * with no reachable vendor renders through the mock driver rather than
 * refusing, which is what keeps a fresh clone with an empty .env.local a
 * working product instead of a dead Generate button.
 */
export function routeGeneration({ modelId, userKey }: RouteInput): RouteDecision {
  const model = getModel(modelId)

  if (!model) {
    return {
      driver: mock,
      providerName: 'mock',
      intendedProvider: 'mock',
      keySource: 'none',
      fallbackReason: `unknown model ${modelId}`,
    }
  }

  return routeForModel(model, userKey)
}

function routeForModel(model: ModelEntry, userKey?: string | null): RouteDecision {
  const intended = model.provider

  const base = { intendedProvider: intended } as const

  if (!canGenerateWith(intended)) {
    return {
      ...base,
      driver: mock,
      providerName: 'mock',
      keySource: 'none',
      fallbackReason: directProvidersEnabled
        ? `no generation driver for ${intended}`
        : 'direct providers disabled (AI_ENABLE_DIRECT_PROVIDERS)',
    }
  }

  const driverModule = MODULES[intended]
  const create = driverModule?.createDriver
  if (!create) {
    // Unreachable given canGenerateWith, but narrowing here beats a non-null
    // assertion that a later edit could quietly invalidate.
    return {
      ...base,
      driver: mock,
      providerName: 'mock',
      keySource: 'none',
      fallbackReason: `no generation driver for ${intended}`,
    }
  }

  // The user's own key first. Their quota, their rate limit, their bill.
  const trimmedUserKey = userKey?.trim()
  if (trimmedUserKey) {
    return { ...base, driver: create(trimmedUserKey), providerName: intended, keySource: 'user_key' }
  }

  const shared = serverProviderKey(intended)
  if (shared) {
    return { ...base, driver: create(shared), providerName: intended, keySource: 'server_key' }
  }

  return {
    ...base,
    driver: mock,
    providerName: 'mock',
    keySource: 'none',
    fallbackReason: `no key available for ${intended}`,
  }
}

/**
 * The vendors a user could usefully connect, given what this build can do.
 *
 * Exposed so the settings tab can explain why connecting a key does not yet
 * change where a job runs, instead of implying it does.
 */
export function routingSummary() {
  return {
    directProvidersEnabled,
    aggregatorDefault: env.aiProvider,
  }
}
