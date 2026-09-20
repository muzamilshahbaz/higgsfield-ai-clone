import { describe, expect, it } from 'vitest'

import { fragmentsOf, maskKey, open, seal, secretsMatch } from '@/lib/crypto/secret-box'

const SECRET = 'a-test-secret-with-plenty-of-entropy-0123456789'
const OTHER_SECRET = 'a-different-secret-entirely-9876543210'

describe('seal / open', () => {
  it('round-trips a key', () => {
    const sealed = seal('sk-proj-abcdefghijklmnop1234', SECRET)
    expect(open(sealed, SECRET)).toBe('sk-proj-abcdefghijklmnop1234')
  })

  it('never stores the plaintext in the ciphertext', () => {
    const key = 'sk-live-supersecretvalue'
    const sealed = seal(key, SECRET)
    expect(sealed).not.toContain(key)
    expect(Buffer.from(sealed, 'base64').toString('utf8')).not.toContain(key)
  })

  it('produces a different ciphertext every time for the same input', () => {
    // A deterministic ciphertext would leak that two users pasted the same key.
    const a = seal('same-key-both-times', SECRET)
    const b = seal('same-key-both-times', SECRET)
    expect(a).not.toBe(b)
    expect(open(a, SECRET)).toBe(open(b, SECRET))
  })

  it('refuses to seal an empty value', () => {
    expect(() => seal('', SECRET)).toThrow(/empty/i)
  })

  it('returns null rather than throwing for the wrong secret', () => {
    const sealed = seal('sk-abcdef123456', SECRET)
    expect(open(sealed, OTHER_SECRET)).toBeNull()
  })

  it('rejects a tampered ciphertext instead of decrypting garbage', () => {
    const sealed = seal('sk-abcdef123456', SECRET)
    const bytes = Buffer.from(sealed, 'base64')
    // Flip a bit in the payload; GCM's tag must catch it.
    bytes[bytes.length - 1]! ^= 0x01
    expect(open(bytes.toString('base64'), SECRET)).toBeNull()
  })

  it('rejects a tampered authentication tag', () => {
    const sealed = seal('sk-abcdef123456', SECRET)
    const bytes = Buffer.from(sealed, 'base64')
    bytes[13]! ^= 0xff // inside the 16-byte tag, which starts at offset 12
    expect(open(bytes.toString('base64'), SECRET)).toBeNull()
  })

  it('returns null for anything too short to be a sealed value', () => {
    expect(open('', SECRET)).toBeNull()
    expect(open('aGVsbG8=', SECRET)).toBeNull()
    expect(open('not base64 at all !!!', SECRET)).toBeNull()
  })

  it('handles a key with unicode and whitespace intact', () => {
    const key = 'clé-secrète-with a space'
    expect(open(seal(key, SECRET), SECRET)).toBe(key)
  })
})

describe('fragmentsOf', () => {
  it('keeps the scheme prefix and the last four', () => {
    expect(fragmentsOf('sk-abcdefghijk1234')).toEqual({ prefix: 'sk-', last4: '1234' })
    expect(fragmentsOf('r8_abcdefghijklmnop9876')).toEqual({ prefix: 'r8_', last4: '9876' })
  })

  it('takes no prefix from a key that has no separator', () => {
    // Otherwise the "prefix" would be the first few bytes of real entropy.
    expect(fragmentsOf('AIzaSyABCDEFGH1234')).toEqual({ prefix: '', last4: '1234' })
  })

  it('ignores a separator that appears too late to be a scheme', () => {
    expect(fragmentsOf('abcdefghijklmnop-1234').prefix).toBe('')
  })

  it('trims before reading the last four', () => {
    expect(fragmentsOf('  sk-abcdefgh4321\n').last4).toBe('4321')
  })

  it('does not invent a last4 for a very short value', () => {
    expect(fragmentsOf('abc')).toEqual({ prefix: '', last4: '' })
  })
})

describe('maskKey', () => {
  it('renders the documented shape', () => {
    expect(maskKey('sk-', '1234')).toBe('sk-••••••••1234')
  })

  it('falls back to dots when there is no last4', () => {
    expect(maskKey('', '')).toBe('••••••••••••')
  })

  it('reveals at most four characters of the key', () => {
    const masked = maskKey('sk-', '1234')
    expect(masked.replace(/[•]/g, '').replace('sk-', '')).toHaveLength(4)
  })
})

describe('secretsMatch', () => {
  it('compares equal and unequal values', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
  })

  it('returns false for different lengths without throwing', () => {
    // timingSafeEqual throws on a length mismatch; the wrapper must not.
    expect(secretsMatch('abc', 'abcd')).toBe(false)
  })
})
