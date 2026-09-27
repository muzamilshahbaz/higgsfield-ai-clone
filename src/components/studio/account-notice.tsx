import Link from 'next/link'
import { Ban, PauseCircle, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AccountState } from '@/lib/account-status'

/**
 * What a suspended, banned or locked-out visitor sees instead of the studio.
 *
 * Three things it deliberately does, because each one is what turns a dead end into something
 * somebody can act on:
 *
 *   · It names the state. "Suspended" and "banned" mean different things and imply different next
 *     steps, and a generic "access restricted" leaves somebody guessing which they are in.
 *   · It gives the reason an operator wrote, verbatim. The reason field is required when
 *     suspending precisely so this page has something to say.
 *   · It says when a suspension ends, and does not pretend a ban does.
 *
 * It does not sign anybody out. A suspended account can still read its own profile — which is what
 * makes this page possible at all — and signing them out would leave them unable to see why.
 */
export function AccountNotice({
  state,
  supportEmail,
}: {
  state: AccountState
  supportEmail: string | null
}) {
  const banned = state.status === 'banned'
  const Icon = banned ? Ban : PauseCircle

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <span
        className={`flex size-12 items-center justify-center rounded-xl ${
          banned ? 'bg-destructive/15 text-danger' : 'bg-warning/15 text-warning'
        }`}
        aria-hidden
      >
        <Icon className="size-6" />
      </span>

      <h1 className="mt-6 font-display text-2xl font-semibold">
        {banned ? 'This account has been banned' : 'This account is suspended'}
      </h1>

      {state.reason && (
        <p className="mt-4 rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm leading-relaxed text-foreground/90">
          {state.reason}
        </p>
      )}

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {banned ? (
          <>
            You can still sign in and see this page, but the studio is not available and no new
            generations can be made.
          </>
        ) : state.until ? (
          <>
            The suspension lifts on{' '}
            <time dateTime={state.until} className="text-foreground">
              {new Date(state.until).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
            . Nothing you have made has been deleted, and it will all be here when you come back.
          </>
        ) : (
          <>
            There is no end date on this suspension. Nothing you have made has been deleted — get in
            touch if you think this is a mistake.
          </>
        )}
      </p>

      <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
        {supportEmail && (
          <Button asChild variant="outline">
            <a href={`mailto:${supportEmail}`}>Contact support</a>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/">Back to the site</Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * The maintenance notice.
 *
 * Staff never see this — `isUnderMaintenance` takes whether the viewer is staff, and the flag page
 * says so — because the person who turned maintenance mode on is usually the person who then needs
 * to check whether the thing they were fixing is fixed.
 *
 * The marketing site stays up. Only the studio is gated, so a visitor can still read what the
 * product is while it is being worked on.
 */
export function MaintenanceNotice({ siteName }: { siteName: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <span
        className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-brand"
        aria-hidden
      >
        <Wrench className="size-6" />
      </span>

      <h1 className="mt-6 font-display text-2xl font-semibold">{siteName} is being worked on</h1>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        The studio is briefly unavailable while we make a change. Nothing has been lost — your
        projects, your library and your credits are exactly where you left them.
      </p>

      <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/">Read about the product</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/explore">Browse the feed</Link>
        </Button>
      </div>
    </div>
  )
}
