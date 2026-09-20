import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * Runway Gen-4.
 *
 * `/v1/organization` reports the account's tier and credit balance, which is
 * exactly a whoami. `X-Runway-Version` is mandatory on every call — omit it
 * and a perfectly good key comes back 400, which would read as "unreachable"
 * in the UI for a reason that has nothing to do with the key.
 */
const RUNWAY_API_VERSION = '2024-11-06'

const runway: ProviderDriverModule = {
  id: 'runway',

  async verifyKey(key) {
    const result = await probe('https://api.dev.runwayml.com/v1/organization', {
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
    })
    return interpret(result, 'Runway')
  },
}

export default runway
