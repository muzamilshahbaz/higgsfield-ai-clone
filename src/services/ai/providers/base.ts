import 'server-only'

import type { AIProvider } from '@/lib/ai/types'
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
