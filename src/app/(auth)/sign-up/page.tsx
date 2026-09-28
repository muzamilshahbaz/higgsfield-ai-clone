import Link from 'next/link'
import type { Metadata } from 'next'

import { GoogleButton } from '@/components/auth/google-button'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { getFlags } from '@/lib/flags'
import { getEnabledAuthProviders } from '@/lib/supabase/providers'
import { safeNextPath } from '@/lib/validation/auth'
import { signupGrant } from '@/services/cms/credits.service'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'No card required.',
}

export default async function SignUpPage({
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

  const [providers, flags, grant] = await Promise.all([
    getEnabledAuthProviders(),
    getFlags(),
    signupGrant(),
  ])

  /*
   * Registration closed.
   *
   * A page that explains itself rather than a 404, because somebody following an invite link
   * needs to know the door is shut rather than that it moved. Sign-in stays reachable — closing
   * signup must not lock out the people who already have accounts.
   *
   * This is the visible half. The Server Action behind the form checks the same flag, because a
   * hidden form is not a closed door.
   */
  if (!flags.registration) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-[1.75rem] font-semibold">Registration is closed</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            New accounts are not being created at the moment. If you already have one, you can still
            sign in as normal.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-medium text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-[1.75rem] font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          {grant > 0
            ? `Your first shot is ${grant} credits away.`
            : 'Connect a provider key and start generating.'}
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
          href={redirectTo ? `/sign-in?next=${encodeURIComponent(redirectTo)}` : '/sign-in'}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
