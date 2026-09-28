import Link from 'next/link'
import type { Metadata } from 'next'

import { GoogleButton } from '@/components/auth/google-button'
import { SignInForm } from '@/components/auth/sign-in-form'
import { getEnabledAuthProviders } from '@/lib/supabase/providers'
import { safeNextPath } from '@/lib/validation/auth'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Kinetic studio.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  /*
   * Only a destination the visitor actually asked for is forwarded.
   *
   * `safeNextPath(next)` defaults to /dashboard, and passing that default into
   * the form made the hidden field always non-empty — so the action's own
   * decision about where this account belongs could never apply, and every
   * staff sign-in landed in the studio. An empty string here means "no opinion",
   * which is what lets postSignInPath() answer.
   *
   * A hostile or malformed `next` also resolves to empty rather than to the
   * studio: it is not a destination anybody chose, so it should not beat the
   * one the account has.
   */
  const redirectTo = next ? safeNextPath(next, '') : ''
  const providers = await getEnabledAuthProviders()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-[1.75rem] font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to pick up where your last shot left off.
        </p>
      </div>

      {/* Rendered only when the provider is actually enabled on the project,
          so this is never a button that fails when pressed. */}
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

      <SignInForm next={redirectTo} />

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link
          href={redirectTo ? `/sign-up?next=${encodeURIComponent(redirectTo)}` : '/sign-up'}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  )
}
