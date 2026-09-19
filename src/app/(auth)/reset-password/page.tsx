import Link from 'next/link'
import type { Metadata } from 'next'

import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { getCurrentUser } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
}

/**
 * Where /auth/callback lands a recovery link. By this point the one-time code
 * has already been exchanged for a session, so there is a user to update.
 *
 * Deliberately NOT in the middleware's AUTH_PREFIXES: everyone who reaches
 * this page is signed in, and bouncing them to /dashboard would make the
 * password reset impossible to complete.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser()

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
          <p className="text-sm text-muted-foreground">
            Reset links can only be used once. Request a new one and it will work.
          </p>
        </div>

        <Link
          href="/forgot-password"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Send a new reset link
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a new password for <span className="text-foreground">{user.email}</span>.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  )
}
