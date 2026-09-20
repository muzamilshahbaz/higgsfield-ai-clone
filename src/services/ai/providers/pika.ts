import 'server-only'

import { unverifiable, type ProviderDriverModule } from './base'

/**
 * Pika.
 *
 * Pika's generation API is invite-gated and publishes no stable public
 * endpoint for checking a credential. Rather than probe an undocumented URL
 * and report a guess, the key is stored and its status stays `unverified` —
 * which the settings UI renders as exactly that, not as a green tick.
 *
 * When a documented endpoint appears, this file is the only thing that
 * changes: give it a real verifyKey and the tab updates itself.
 */
const pika: ProviderDriverModule = {
  id: 'pika',

  async verifyKey() {
    return unverifiable('Pika')
  },
}

export default pika
