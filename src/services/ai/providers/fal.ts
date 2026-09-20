import 'server-only'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * fal.ai — the aggregator the model registry currently points most entries at.
 *
 * fal publishes no "whoami" endpoint, so the probe asks the queue about a
 * request id that cannot exist. A bogus credential gets 401 before the id is
 * ever looked up; an accepted one gets 404, meaning "you are authenticated,
 * that request is not ours". Nothing is enqueued and nothing is billed.
 *
 * The empty-key guard is load bearing, not defensive padding. fal skips the
 * auth check entirely when no Authorization header value is present and
 * answers 404 — which the whitelist below would read as success. The schema
 * already enforces a minimum length, so this cannot happen through the UI,
 * but the whitelist is what makes 404 mean "good" and it must never be
 * reachable without a credential actually having been checked.
 */
const FAKE_REQUEST_ID = '00000000-0000-4000-8000-000000000000'

const fal: ProviderDriverModule = {
  id: 'fal',

  async verifyKey(key) {
    if (!key.trim()) return { status: 'invalid', message: 'No fal.ai key was provided.' }

    const result = await probe(
      `https://queue.fal.run/fal-ai/flux/requests/${FAKE_REQUEST_ID}/status`,
      { headers: { Authorization: `Key ${key}` } },
    )
    // 404 and 422 both mean "your credential was accepted, that id was not".
    return interpret(result, 'fal.ai', [404, 422])
  },
}

export default fal
