import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * OpenAI image generation.
 *
 * `GET /v1/models` is the cheapest authenticated call on the platform: it
 * bills nothing, needs no scopes beyond the key's own, and returns 401 on a
 * revoked key — which is the entire question being asked.
 */
const openai: ProviderDriverModule = {
  id: 'openai',

  async verifyKey(key) {
    const result = await probe('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    return interpret(result, 'OpenAI')
  },
}

export default openai
