import Link from 'next/link'
import { ArrowRight, KeyRound } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Button } from '@/components/ui/button'
import { MODELS } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'

/**
 * The closing call to action.
 *
 * Full-bleed and darker than the section above it, so the page ends on a
 * deliberate beat rather than trailing off into the footer. The aurora is
 * reused from the hero: the page opens and closes on the same light.
 */
export function FinalCta({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden border-t border-border/60 py-28">
      <div className="aurora opacity-70" aria-hidden />
      <div className="absolute inset-0 grid-lines opacity-30" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-gradient">Your first shot</span> is {SIGNUP_CREDIT_GRANT}{' '}
            credits away
          </h2>

          <p className="mx-auto mt-5 max-w-lg text-pretty text-muted-foreground">
            Sign up, pick a camera move, and watch a still frame start moving. {MODELS.length}{' '}
            models, no card, and you can plug in your own API keys whenever you want to.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={isSignedIn ? '/create' : '/sign-up'}>
                {isSignedIn ? 'Open the composer' : 'Create your account'}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href={isSignedIn ? '/settings/keys' : '/sign-in'}>
                <KeyRound className="size-4" aria-hidden />
                {isSignedIn ? 'Connect your API keys' : 'Sign in'}
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
