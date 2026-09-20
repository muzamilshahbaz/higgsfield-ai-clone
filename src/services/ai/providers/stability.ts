import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * Stability AI — Stable Diffusion.
 *
 * `/v1/user/account` is the documented identity endpoint and costs no credits,
 * so verification never spends a user's balance to prove their key exists.
 */
const stability: ProviderDriverModule = {
  id: 'stability',

  async verifyKey(key) {
    const result = await probe('https://api.stability.ai/v1/user/account', {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    })
    return interpret(result, 'Stability AI')
  },
}

export default stability
