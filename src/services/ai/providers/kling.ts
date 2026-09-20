import 'server-only'

import { createHmac } from 'node:crypto'

import { interpret, probe, type ProviderDriverModule } from './base'

/**
 * Kling AI.
 *
 * The odd one out: Kling does not take an API key directly. It issues an
 * access key and a secret, and every request carries a short-lived HS256 JWT
 * signed with the secret. So the credential the user pastes is the pair
 * `accessKey:secretKey`, and the secret half is used to mint a token here —
 * on the server, per request, never stored in signed form.
 *
 * Writing the JWT by hand rather than adding a dependency: it is three
 * base64url segments and one HMAC, and a signing library for one vendor is
 * more supply chain than this is worth.
 */

const TOKEN_TTL_SEC = 1800

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Splits on the FIRST colon only — a secret may legitimately contain one. */
export function splitKlingCredential(raw: string): { accessKey: string; secret: string } | null {
  const separator = raw.indexOf(':')
  if (separator <= 0) return null

  const accessKey = raw.slice(0, separator).trim()
  const secret = raw.slice(separator + 1).trim()
  if (!accessKey || !secret) return null

  return { accessKey, secret }
}

export function signKlingToken(accessKey: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  // `nbf` is backdated five seconds because Kling rejects a token whose
  // not-before is in its own future, and two clocks are never identical.
  const payload = base64Url(
    JSON.stringify({ iss: accessKey, exp: nowSec + TOKEN_TTL_SEC, nbf: nowSec - 5 }),
  )

  const signature = base64Url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest(),
  )

  return `${header}.${payload}.${signature}`
}

const kling: ProviderDriverModule = {
  id: 'kling',

  async verifyKey(key) {
    const credential = splitKlingCredential(key)
    if (!credential) {
      return {
        status: 'invalid',
        message: 'Kling needs both halves, as accessKey:secretKey.',
      }
    }

    let token: string
    try {
      token = signKlingToken(credential.accessKey, credential.secret)
    } catch {
      return { status: 'invalid', message: 'That secret could not be used to sign a token.' }
    }

    const result = await probe(
      'https://api.klingai.com/v1/videos/image2video?pageNum=1&pageSize=1',
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    )

    if ('error' in result) return interpret(result, 'Kling')

    // Kling answers 200 with an error code in the body rather than an HTTP
    // status, so a 200 alone does not mean the credential was accepted.
    if (result.ok && /"code"\s*:\s*(1000|1001|1002|1003|1004)\b/.test(result.body)) {
      return { status: 'invalid', message: 'Kling rejected that access key and secret.' }
    }

    return interpret(result, 'Kling')
  },
}

export default kling
