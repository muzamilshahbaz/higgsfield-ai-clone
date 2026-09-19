import { describe, expect, it } from 'vitest'

import {
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth'

/**
 * These schemas are the only thing standing between a form post and the auth
 * provider, and `safeNextPath` is the only thing standing between a crafted
 * link and an open redirect off the site.
 */

describe('safeNextPath', () => {
  it('passes a plain local path through', () => {
    expect(safeNextPath('/create')).toBe('/create')
    expect(safeNextPath('/projects/abc?tab=all')).toBe('/projects/abc?tab=all')
  })

  it('falls back when nothing was supplied', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath('')).toBe('/dashboard')
  })

  it('honours a caller-supplied fallback', () => {
    expect(safeNextPath('', '/explore')).toBe('/explore')
  })

  // The attack this exists to stop: a link that signs someone in and then
  // drops them on an attacker's page that looks like the real thing.
  it('refuses absolute URLs to another origin', () => {
    expect(safeNextPath('https://evil.example.com')).toBe('/dashboard')
    expect(safeNextPath('http://evil.example.com/path')).toBe('/dashboard')
  })

  it('refuses protocol-relative URLs, which browsers treat as external', () => {
    expect(safeNextPath('//evil.example.com')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.example.com')).toBe('/dashboard')
  })

  it('refuses javascript: and data: payloads', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeNextPath('data:text/html,<script>alert(1)</script>')).toBe('/dashboard')
  })

  it('refuses anything not anchored at a single slash', () => {
    for (const candidate of ['create', './create', '../create', ' /create']) {
      expect(safeNextPath(candidate), candidate).toBe('/dashboard')
    }
  })
})

describe('signInSchema', () => {
  it('accepts a normal sign-in', () => {
    const result = signInSchema.safeParse({ email: 'ada@example.com', password: 'whatever' })
    expect(result.success).toBe(true)
  })

  it('trims the email, so a stray space is not a failed login', () => {
    const result = signInSchema.safeParse({ email: '  ada@example.com  ', password: 'x' })
    expect(result.success && result.data.email).toBe('ada@example.com')
  })

  it('rejects a malformed email', () => {
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
  })

  it('requires a password but does not impose a length rule on sign-in', () => {
    // An existing account may predate the current minimum; the provider is the
    // judge here, not us.
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true)
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })
})

describe('signUpSchema', () => {
  it('accepts a normal sign-up', () => {
    const result = signUpSchema.safeParse({
      email: 'ada@example.com',
      password: 'longenough1',
      displayName: 'Ada Lovelace',
    })
    expect(result.success).toBe(true)
  })

  it('enforces the 8-character minimum the form advertises', () => {
    const result = signUpSchema.safeParse({ email: 'a@b.co', password: 'short' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/8 characters/)
    }
  })

  it('caps the password at bcrypt’s 72-byte limit rather than silently truncating', () => {
    const result = signUpSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(73) })
    expect(result.success).toBe(false)
  })

  it('treats a blank display name as acceptable', () => {
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'longenough1', displayName: '' }).success).toBe(true)
  })

  it('rejects a one-character display name', () => {
    const result = signUpSchema.safeParse({
      email: 'a@b.co',
      password: 'longenough1',
      displayName: 'A',
    })
    expect(result.success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('needs a valid email and nothing else', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'ada@example.com' }).success).toBe(true)
    expect(forgotPasswordSchema.safeParse({ email: '' }).success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('accepts two matching passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenough1',
      confirmPassword: 'longenough1',
    })
    expect(result.success).toBe(true)
  })

  it('reports a mismatch against the confirm field, where the user can see it', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenough1',
      confirmPassword: 'longenough2',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'confirmPassword')
      expect(issue?.message).toMatch(/do not match/)
    }
  })

  it('still enforces the length rule on the new password', () => {
    expect(resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success).toBe(
      false,
    )
  })
})
