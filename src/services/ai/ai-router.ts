import 'server-only'

import { getModel, providersFor, type ModelEntry } from '@/lib/ai/registry'
import { getProvider } from '@/lib/ai/catalogue'
import type { AIProvider } from '@/lib/ai/types'
import { serverProviderKey } from '@/lib/env'
import type { ProviderName } from '@/types/database'

import type { ProviderDriverModule, VerifyResult } from './providers/base'
import fal from './providers/fal'
import flux from './providers/flux'
import google from './providers/google'
import huggingface from './providers/huggingface'
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
 * provider runs the job and whose credential pays for it?
 *
 * A model does not name one vendor. It names an ordered list of providers that
 * can serve it (`routes` in lib/ai/registry.ts), and this walks that list:
 *
 *   for each provider the model can run on, in preference order
 *     1. a real generation driver for it must exist in this build
 *     2. the user's own key for that provider, if they connected one
 *     3. the operator's shared key for that provider, if one is configured
 *
 * The first provider that clears all three runs the job. If none does, the
 * answer is a refusal with a sentence naming what to connect. There is no
 * stand-in driver to fall back to and deliberately so: a generation that did
 * not happen must never look like one that did, which is why
 * `routeGeneration` can fail and why the caller checks before it debits a
 * single credit.
 *
 * Everything in here is a pure function of its arguments plus the environment.
 * Fetching the user's keys is the caller's job (services/ai-keys.service.ts),
 * which keeps this module free of Supabase and therefore unit-testable.
 */

const MODULES: Record<ProviderName, ProviderDriverModule | null> = {
  mock: null,
  huggingface,
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

/** Where the credential that will run this job came from. */
export type KeySource = 'user_key' | 'server_key' | 'none'

export interface RouteSuccess {
  ok: true
  driver: AIProvider
  /** Recorded on the generation row, so history says who actually ran it. */
  providerName: ProviderName
  keySource: KeySource
}

export interface RouteFailure {
  ok: false
  code: 'UNKNOWN_MODEL' | 'NO_PROVIDER_KEY'
  /** Shown to the user verbatim, so it says what to do next. */
  message: string
  /** The providers that could have run it, for the log and the UI hint. */
  candidates: ProviderName[]
}

export type RouteDecision = RouteSuccess | RouteFailure

/** The verification module for a vendor, or null if it has none. */
export function driverModuleFor(provider: ProviderName): ProviderDriverModule | null {
  return MODULES[provider] ?? null
}

/** Can this build run a real job through this provider? */
export function canGenerateWith(provider: ProviderName): boolean {
  return typeof MODULES[provider]?.createDriver === 'function'
}

/** Every provider this build can actually generate through, in catalogue order. */
export function generationProviders(): ProviderName[] {
  return (Object.keys(MODULES) as ProviderName[]).filter(canGenerateWith)
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
  /**
   * The caller's decrypted keys, by provider. Only providers present here are
   * considered as the user's own; everything else falls to the shared key.
   */
  keys?: Partial<Record<ProviderName, string | null>>
  /**
   * Pins the decision to one provider, for advancing a job that was already
   * submitted somewhere. Without this, a user connecting a new key mid-job
   * would move the poll to a provider that never saw the submission.
   */
  only?: ProviderName
}

export function routeGeneration({ modelId, keys, only }: RouteInput): RouteDecision {
  const model = getModel(modelId)

  if (!model) {
    return {
      ok: false,
      code: 'UNKNOWN_MODEL',
      message: 'That model no longer exists. Pick another one.',
      candidates: [],
    }
  }

  return routeForModel(model, keys ?? {}, only)
}

function routeForModel(
  model: ModelEntry,
  keys: Partial<Record<ProviderName, string | null>>,
  only?: ProviderName,
): RouteDecision {
  const candidates = providersFor(model).filter((provider) => !only || provider === only)

  for (const provider of candidates) {
    const create = MODULES[provider]?.createDriver
    if (!create) continue

    // The user's own key first. Their quota, their rate limit, their bill.
    const userKey = keys[provider]?.trim()
    if (userKey) {
      return { ok: true, driver: create(userKey), providerName: provider, keySource: 'user_key' }
    }

    const shared = serverProviderKey(provider)
    if (shared) {
      return { ok: true, driver: create(shared), providerName: provider, keySource: 'server_key' }
    }
  }

  return {
    ok: false,
    code: 'NO_PROVIDER_KEY',
    message: connectKeyMessage(model, candidates),
    candidates,
  }
}

/**
 * The sentence a user reads when nothing can run their job.
 *
 * It names the model they chose and the accounts that would serve it, because
 * "no provider configured" tells someone with a fal.ai key nothing about the
 * fact that they are two clicks from a working generation.
 */
function connectKeyMessage(model: ModelEntry, candidates: ProviderName[]): string {
  const runnable = candidates.filter(canGenerateWith)

  if (runnable.length === 0) {
    return `${model.label} cannot run in this deployment yet. Pick another model.`
  }

  const labels = runnable.map((provider) => getProvider(provider)?.label ?? provider)
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`

  return `${model.label} needs an API key. Add a ${list} key in Settings → AI model keys, then try again.`
}

/**
 * What this deployment can do, for the settings page to state plainly.
 *
 * Derived from the modules themselves rather than from a flag, so the page
 * cannot claim a capability the build does not have.
 */
export function routingSummary() {
  const providers = generationProviders()

  return {
    generationProviders: providers,
    generationProviderLabels: providers.map(
      (provider) => getProvider(provider)?.label ?? provider,
    ),
  }
}
