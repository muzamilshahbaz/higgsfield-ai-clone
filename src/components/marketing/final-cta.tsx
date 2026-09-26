import Link from 'next/link'
import { ArrowRight, KeyRound } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Button } from '@/components/ui/button'
import { MODELS } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'

/**
 * The closing call to action.
 *
 * The page opens on a light wash from the top left and closes on the same wash
 * inverted, so the two ends of the scroll are recognisably a pair without
 * repeating the hero's layout. Full-bleed and bordered top and bottom, so it
 * reads as a deliberate final beat rather than trailing off into the footer.
 */
export function FinalCta({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden border-y border-border/70 py-24 sm:py-32">
      <div className="light-wash pointer-events-none absolute inset-0 rotate-180" aria-hidden />
      <div className="blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <p className="eyebrow text-brand">Start here</p>

          <h2 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl">
            Your first shot is{' '}
            <span className="relative whitespace-nowrap">
              <span className="relative z-10 tabular-nums">{SIGNUP_CREDIT_GRANT} credits</span>
              <span className="absolute inset-x-0 bottom-[0.06em] h-[0.2em] bg-primary/25" aria-hidden />
            </span>{' '}
            away
          </h2>

          <p className="mx-auto mt-5 max-w-lg text-pretty text-[15px] leading-relaxed text-muted-foreground">
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
