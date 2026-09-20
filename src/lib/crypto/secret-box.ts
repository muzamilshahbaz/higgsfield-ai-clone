import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Authenticated encryption for the provider keys users hand us.
 *
 * AES-256-GCM, not AES-CBC and not "base64 is basically encoding": GCM gives
 * an authentication tag, so a ciphertext that was tampered with in the
 * database fails to open rather than decrypting into attacker-chosen bytes.
 *
 * The sealed form is base64(iv ‖ tag ‖ ciphertext) in one column. Keeping the
 * three parts together means there is no way to write a row with a mismatched
 * iv, and no second column to forget in a migration.
 *
 * What this does NOT defend against: someone who already has both the
 * database and AI_KEY_ENCRYPTION_SECRET. It defends against a leaked dump, a
 * mis-scoped query and a backup on the wrong disk — which is the realistic
 * set. Rotating out of that requires a KMS, and the seam for it is this file.
 */

const IV_BYTES = 12 // 96 bits, the size GCM is specified for
const TAG_BYTES = 16
const KEY_BYTES = 32

/**
 * A fixed salt, deliberately.
 *
 * scrypt here is stretching a high-entropy server secret into a key of the
 * right length, not hashing a human password. A per-ciphertext salt would mean
 * storing it and re-running scrypt (which is intentionally slow) on every
 * single decrypt — meaningful cost on the generation hot path for no gain,
 * because the input is already unguessable.
 */
const KDF_SALT = 'kinetic.provider-keys.v1'

let cachedSecret: string | undefined
let cachedKey: Buffer | undefined

function deriveKey(secret: string): Buffer {
  if (cachedKey && cachedSecret === secret) return cachedKey
  cachedKey = scryptSync(secret, KDF_SALT, KEY_BYTES)
  cachedSecret = secret
  return cachedKey
}

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretBoxError'
  }
}

/** Seals a plaintext secret. Throws only if the secret is unusable. */
export function seal(plaintext: string, secret: string): string {
  if (!plaintext) throw new SecretBoxError('Refusing to seal an empty value.')

  const key = deriveKey(secret)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, sealed]).toString('base64')
}

/**
 * Opens a sealed value.
 *
 * Returns null rather than throwing on anything malformed or tampered with:
 * every caller's answer to "this key will not open" is the same — treat the
 * connection as broken and fall back — and a throw here would take down a
 * generation request that has a perfectly good fallback available.
 */
export function open(sealedBase64: string, secret: string): string | null {
  let raw: Buffer
  try {
    raw = Buffer.from(sealedBase64, 'base64')
  } catch {
    return null
  }

  if (raw.length <= IV_BYTES + TAG_BYTES) return null

  try {
    const iv = raw.subarray(0, IV_BYTES)
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const payload = raw.subarray(IV_BYTES + TAG_BYTES)

    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
  } catch {
    // Wrong secret, truncated column, or a modified tag. All the same answer.
    return null
  }
}

/**
 * Constant-time comparison, for the rare case where two secrets are compared
 * directly rather than through a sealed round trip.
 */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * The masked form the UI renders: `sk-••••••••1234`.
 *
 * Built from the stored prefix and last four, never from a decrypted key, so
 * no display path has a reason to open a sealed value.
 */
export function maskKey(prefix: string, last4: string): string {
  const head = prefix ? prefix : ''
  const tail = last4 ? last4 : '••••'
  return `${head}${'•'.repeat(8)}${tail}`
}

/**
 * Splits a raw key into the two fragments we are willing to store in clear.
 *
 * The prefix stops at the first separator and is capped, because vendors put
 * meaningful-but-not-secret scheme text there (`sk-`, `sk-proj-`, `r8_`) and
 * showing it helps a user tell two accounts apart. Anything without a
 * separator gets no prefix at all rather than the first few bytes of entropy.
 */
export function fragmentsOf(rawKey: string): { prefix: string; last4: string } {
  const key = rawKey.trim()
  const last4 = key.length >= 4 ? key.slice(-4) : ''

  const separator = key.search(/[-_]/)
  const prefix =
    separator > 0 && separator <= 8 ? key.slice(0, Math.min(separator + 1, 12)) : ''

  return { prefix, last4 }
}
