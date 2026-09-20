import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * Google AI — one key for both Imagen (stills) and Veo (video).
 *
 * The key goes in the `x-goog-api-key` header, not the `?key=` query string
 * the quickstart uses. A credential in a URL ends up in access logs, proxy
 * logs and any error report that echoes the request line, and this one is a
 * user's, not ours.
 *
 * Google answers a bad key with 400 INVALID_ARGUMENT rather than 401, so the
 * generic interpretation would file a definitively dead key under "could not
 * reach them". The body is checked for Google's own wording instead: a plain
 * 400 really could be a malformed request on our side, but a 400 that says
 * the API key is not valid is the vendor telling us the key is not valid.
 */
const INVALID_KEY_SIGNATURE = /API key not valid|API_KEY_INVALID|API key expired/i

const google: ProviderDriverModule = {
  id: 'google',

  async verifyKey(key) {
    const result = await probe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      { headers: { 'x-goog-api-key': key } },
    )

    if (!('error' in result) && result.status === 400 && INVALID_KEY_SIGNATURE.test(result.body)) {
      return { status: 'invalid', message: 'Google AI rejected this key as invalid.' }
    }

    return interpret(result, 'Google AI')
  },
}

export default google
