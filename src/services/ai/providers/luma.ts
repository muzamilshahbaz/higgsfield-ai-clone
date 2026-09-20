import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * Luma Dream Machine.
 *
 * Listing one generation is a read, so it neither creates a job nor bills the
 * account, and it returns an empty list rather than an error for a brand new
 * key that has never generated anything.
 */
const luma: ProviderDriverModule = {
  id: 'luma',

  async verifyKey(key) {
    const result = await probe(
      'https://api.lumalabs.ai/dream-machine/v1/generations?limit=1&offset=0',
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
    )
    return interpret(result, 'Luma')
  },
}

export default luma
