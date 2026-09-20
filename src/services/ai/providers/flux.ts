import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * Flux, direct from Black Forest Labs.
 *
 * `/v1/credits` is the only BFL endpoint found that actually authenticates:
 *
 *   valid key   -> 200 with a balance
 *   bogus key   -> 422 {"detail":"Invalid API key format"}
 *   no key      -> 403 {"detail":"Not authenticated"}
 *
 * It replaces an earlier probe against `/v1/get_result?id=<nonexistent>`,
 * which looked reasonable and was actively wrong: that route returns 404
 * "Task not found" with or without any credential, so every key — including
 * a garbage one — came back verified. A green tick on a dead key is worse
 * than no check at all, because it moves the failure to the user's first
 * real generation and makes the status column untrustworthy everywhere else.
 *
 * Hence no `okStatuses` whitelist here. Only a 200 means valid.
 */
const flux: ProviderDriverModule = {
  id: 'flux',

  async verifyKey(key) {
    const result = await probe('https://api.bfl.ai/v1/credits', {
      headers: { 'x-key': key, Accept: 'application/json' },
    })

    // BFL says "wrong shape" with 422 rather than 401. That is a rejection,
    // not an outage, so it must not fall through to `unreachable`.
    if (!('error' in result) && result.status === 422) {
      return { status: 'invalid', message: 'Black Forest Labs rejected this key.' }
    }

    return interpret(result, 'Black Forest Labs')
  },
}

export default flux
