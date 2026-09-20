import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/** Replicate. `/v1/account` is the documented whoami and bills nothing. */
const replicate: ProviderDriverModule = {
  id: 'replicate',

  async verifyKey(key) {
    const result = await probe('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Bearer ${key}` },
    })
    return interpret(result, 'Replicate')
  },
}

export default replicate
