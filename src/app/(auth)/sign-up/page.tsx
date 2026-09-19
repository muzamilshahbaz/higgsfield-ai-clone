import Link from 'next/link'
import type { Metadata } from 'next'

import { GoogleButton } from '@/components/auth/google-button'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { getEnabledAuthProviders } from '@/lib/supabase/providers'
import { safeNextPath } from '@/lib/validation/auth'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Start with 200 credits. No card required.',
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const redirectTo = safeNextPath(next)
  const providers = await getEnabledAuthProviders()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Your first shot is 200 credits away.
        </p>
      </div>

      {providers.google && (
        <>
          <GoogleButton next={redirectTo} />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <SignUpForm next={redirectTo} />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={next ? `/sign-in?next=${encodeURIComponent(redirectTo)}` : '/sign-in'}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
