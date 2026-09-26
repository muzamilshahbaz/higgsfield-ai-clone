import 'server-only'

import { type AIProvider, ProviderRequestError } from '@/lib/ai/types'
import type { ProviderKeyStatus, ProviderName } from '@/types/database'

/**
 * Shared scaffolding for the per-vendor drivers.
 *
 * Two jobs live behind one module per vendor:
 *   verifyKey()   — is this credential real? Read-only, cheap, no spend.
 *   createDriver() — optional. An AIProvider that can actually run a job.
 *
 * They are separate because they mature at different rates. Verification is a
 * single documented GET and is worth shipping for every vendor immediately.
 * A generation driver is a whole job lifecycle, and shipping an unverified one
 * means a user's first real generation fails. So the router treats a missing
 * createDriver as a routing fact, not an error.
 */

export interface VerifyResult {
  status: ProviderKeyStatus
  /** Shown verbatim in the settings UI, so it is written for a person. */
  message: string
}

export interface ProviderDriverModule {
  id: ProviderName
  verifyKey(key: string): Promise<VerifyResult>
  /**
   * Present only when this build can run a real job through the vendor.
   * The router checks for it rather than trusting a boolean flag.
   */
  createDriver?(key: string): AIProvider
}

/**
 * Verification must never hold a Server Action open, and it must lose the
 * race to the platform rather than win it.
 *
 * Deliberately under Vercel's 10s Hobby function limit, not over it. A longer
 * fetch timeout does not buy a slower vendor more time — the function is
 * killed first, and then nothing gets to write the status back at all. Eight
 * seconds leaves headroom to record `unreachable` and a message the user can
 * act on.
 *
 * Observed in QA: a cold Node process took over 10s on its first outbound
 * HTTPS call (DNS + TLS + connection setup) against an endpoint that answers
 * in ~500ms warm. That is why the key is stored BEFORE verification runs —
 * a timeout here costs a status, never the key someone just pasted.
 */
const VERIFY_TIMEOUT_MS = 8_000

/**
 * A fetch that always terminates.
 *
 * `AbortSignal.timeout` rather than a manual controller + setTimeout: the
 * timer is cleared for us when the request settles, so a slow vendor cannot
 * leak a pending timeout per call on a warm serverless instance.
 */
export async function probe(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: string } | { error: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      // Verification is a live question about a credential; a cached answer
      // would keep reporting "valid" after a key was revoked.
      cache: 'no-store',
    })

    // Capped: an error page can be a megabyte of HTML and none of it belongs
    // in a column or a toast.
    const body = (await response.text().catch(() => '')).slice(0, 400)

    return { ok: response.ok, status: response.status, body }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { error: message.includes('timeout') ? 'timed out' : message }
  }
}

/**
 * The shape almost every vendor's answer collapses to.
 *
 * `okStatuses` exists for the vendors with no cheap read endpoint, where the
 * probe is a deliberately bogus resource lookup: 404 means "authenticated,
 * and that id does not exist", which is exactly the answer we wanted.
 */
export function interpret(
  result: Awaited<ReturnType<typeof probe>>,
  vendor: string,
  okStatuses: number[] = [],
): VerifyResult {
  if ('error' in result) {
    return {
      status: 'unreachable',
      message: `Could not reach ${vendor} (${result.error}). The key was saved but not verified.`,
    }
  }

  if (result.ok || okStatuses.includes(result.status)) {
    return { status: 'valid', message: `${vendor} accepted this key.` }
  }

  if (result.status === 401 || result.status === 403) {
    return { status: 'invalid', message: `${vendor} rejected this key as unauthorised.` }
  }

  if (result.status === 429) {
    return {
      status: 'valid',
      message: `${vendor} accepted the key but is rate limiting. Treating it as connected.`,
    }
  }

  return {
    status: 'unreachable',
    message: `${vendor} answered ${result.status}. The key was saved but not verified.`,
  }
}

/**
 * For a vendor with no public credential endpoint.
 *
 * Deliberately not reported as `valid`: claiming a key works when nothing was
 * checked is the one outcome that would make the status column untrustworthy
 * everywhere else.
 */
export function unverifiable(vendor: string): VerifyResult {
  return {
    status: 'unverified',
    message: `${vendor} has no public endpoint for checking a key. It is stored and will be used as-is.`,
  }
}

// ---------------------------------------------------------------------------
// The generation side
//
// Everything below is shared by the drivers that actually run jobs. It exists
// so that "the provider said no" turns into the same four facts every time —
// a code, a sentence a user can act on, whether retrying could help, and never
// an unhandled rejection halfway through a paid job.
// ---------------------------------------------------------------------------

/**
 * Submit and poll get more room than verification does.
 *
 * Verification races Vercel's function limit and must lose (see
 * VERIFY_TIMEOUT_MS). A submit is different: the job is the request, and a
 * provider that takes 25s to accept a queue entry is still a success. The
 * route handlers that call these set their own `maxDuration`, which is the
 * real ceiling; this is the brake for a connection that hangs open forever.
 */
const REQUEST_TIMEOUT_MS = 55_000

/** Bytes we will hold in memory from one provider response. */
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024

/**
 * What a vendor's HTTP status means for one job.
 *
 * `retryable` is the only field with teeth: the service layer surfaces it so a
 * card can say "try again" honestly, and a content-policy rejection never
 * suggests it. A 503 from Hugging Face means a cold model is loading, which is
 * the single most common first-generation failure and the one most worth
 * phrasing as "not your fault, ask again".
 */
export function providerHttpError(
  vendor: string,
  status: number,
  body: string,
): ProviderRequestError {
  const detail = describe(body)
  const suffix = detail ? ` ${detail}` : ''

  if (status === 401 || status === 403) {
    return new ProviderRequestError(
      'PROVIDER_AUTH',
      `${vendor} rejected the API key. Check it in Settings → AI model keys.${suffix}`,
      false,
    )
  }

  if (status === 402) {
    return new ProviderRequestError(
      'PROVIDER_BILLING',
      `Your ${vendor} account is out of credit for this model.${suffix}`,
      false,
    )
  }

  if (status === 404) {
    return new ProviderRequestError(
      'MODEL_UNAVAILABLE',
      `${vendor} does not serve this model any more.${suffix}`,
      false,
    )
  }

  if (status === 422 || status === 400) {
    return new ProviderRequestError(
      'PROVIDER_REJECTED',
      `${vendor} rejected these settings.${suffix}`,
      false,
    )
  }

  if (status === 429) {
    return new ProviderRequestError(
      'PROVIDER_RATE_LIMIT',
      `${vendor} is rate limiting this key. Wait a moment and try again.${suffix}`,
      true,
    )
  }

  if (status === 503) {
    return new ProviderRequestError(
      'MODEL_LOADING',
      `The model is still loading on ${vendor}. Try again in a minute.${suffix}`,
      true,
    )
  }

  return new ProviderRequestError(
    'PROVIDER_ERROR',
    `${vendor} answered ${status}.${suffix}`,
    status >= 500,
  )
}

/**
 * The human-readable part of an error body, if there is one.
 *
 * Providers disagree on where it lives — `error`, `detail`, `message`, or a
 * list of validation objects — and one of them answers with an HTML page. This
 * returns a short sentence or nothing, never a wall of markup.
 */
function describe(body: string): string {
  const trimmed = body.trim()
  if (!trimmed || trimmed.startsWith('<')) return ''

  try {
    const parsed: unknown = JSON.parse(trimmed)
    const found = firstMessage(parsed)
    if (found) return found.slice(0, 180)
  } catch {
    // Not JSON. Fall through to the raw text.
  }

  return trimmed.slice(0, 180)
}

function firstMessage(value: unknown, depth = 0): string | null {
  if (depth > 4) return null
  if (typeof value === 'string') return value.trim() || null

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstMessage(entry, depth + 1)
      if (found) return found
    }
    return null
  }

  if (value && typeof value === 'object') {
    for (const key of ['error', 'detail', 'message', 'msg', 'title']) {
      if (key in value) {
        const found = firstMessage((value as Record<string, unknown>)[key], depth + 1)
        if (found) return found
      }
    }
  }

  return null
}

/** Wraps a transport failure the same way for every driver. */
function transportError(vendor: string, cause: unknown): ProviderRequestError {
  const message = cause instanceof Error ? cause.message : String(cause)

  if (/timeout|abort/i.test(message)) {
    return new ProviderRequestError(
      'PROVIDER_TIMEOUT',
      `${vendor} did not answer in time. Try again.`,
      true,
    )
  }

  return new ProviderRequestError('NETWORK', `Could not reach ${vendor}: ${message}`, true)
}

export interface ProviderResponse {
  status: number
  ok: boolean
  contentType: string
  /** Present for a JSON or text response. */
  text: string
  /** Present when the response was binary, e.g. image bytes. */
  bytes?: ArrayBuffer
}

/**
 * One HTTP call to a provider, with the failure modes already normalised.
 *
 * Throws `ProviderRequestError` for a transport failure and returns the
 * response otherwise — including a non-2xx one, because some callers read a
 * 404 as information rather than as an error. `expectBinary` keeps an image
 * response as bytes instead of mangling it through `text()`.
 */
export async function providerFetch(
  vendor: string,
  url: string,
  init: RequestInit & { expectBinary?: boolean } = {},
): Promise<ProviderResponse> {
  const { expectBinary, ...requestInit } = init

  let response: Response
  try {
    response = await fetch(url, {
      ...requestInit,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    throw transportError(vendor, cause)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const binary = expectBinary && response.ok && !contentType.includes('json')

  if (!binary) {
    const text = await response.text().catch(() => '')
    return { status: response.status, ok: response.ok, contentType, text }
  }

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_PAYLOAD_BYTES) {
    throw new ProviderRequestError(
      'PAYLOAD_TOO_LARGE',
      `${vendor} returned ${Math.round(declared / 1_000_000)}MB, which is more than this app will store.`,
      false,
    )
  }

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
    throw new ProviderRequestError(
      'PAYLOAD_TOO_LARGE',
      `${vendor} returned more data than this app will store.`,
      false,
    )
  }

  return { status: response.status, ok: true, contentType, text: '', bytes }
}

/** A provider call that must return JSON, with the error paths collapsed. */
export async function providerJson<T>(
  vendor: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await providerFetch(vendor, url, init)

  if (!response.ok) throw providerHttpError(vendor, response.status, response.text)

  try {
    return JSON.parse(response.text) as T
  } catch {
    throw new ProviderRequestError(
      'PROVIDER_ERROR',
      `${vendor} answered with something that was not JSON.`,
      true,
    )
  }
}

/**
 * Text on its way to someone else's API.
 *
 * Control characters are stripped because a prompt is pasted from anywhere —
 * a PDF, a chat, a spreadsheet cell — and a stray 0x00 or 0x1b is a 400 from
 * some providers and a silently truncated prompt on others. The length cap is
 * a second line after the zod schema, for the resolved prompt: a preset
 * fragment is appended server-side, so what reaches a provider is longer than
 * anything the form validated.
 */
export function cleanText(value: string | null | undefined, max = 4_000): string {
  if (!value) return ''

  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** A data URL for bytes a provider returned inline. See RawAsset.url. */
export function toDataUrl(bytes: ArrayBuffer, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

/**
 * Re-export so drivers import one module.
 * `AIProvider` is the contract they implement; the error is how they fail.
 */
export type { AIProvider }
export { ProviderRequestError }
