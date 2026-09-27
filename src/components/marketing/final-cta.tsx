import Link from 'next/link'
import { ArrowRight, KeyRound } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { Button } from '@/components/ui/button'
import { configString, type LandingSection } from '@/lib/cms/content'

/**
 * The closing call to action.
 *
 * The page opens on a light wash from the top left and closes on the same wash inverted, so the
 * two ends of the scroll are recognisably a pair without repeating the hero's layout. Full-bleed
 * and bordered top and bottom, so it reads as a deliberate final beat rather than trailing off
 * into the footer.
 *
 * `{credits}` in the heading is substituted with the live signup grant, which is what keeps the
 * headline true after somebody changes the grant in the admin panel. The underlined phrase is
 * resolved after substitution for the same reason — `{credits} credits` has to match the rendered
 * text, not the stored template.
 */

function fill(text: string, credits: number): string {
  return text.replaceAll('{credits}', String(credits))
}

export function FinalCta({
  section,
  isSignedIn = false,
  signupGrant,
  modelCount,
}: {
  section: LandingSection
  isSignedIn?: boolean
  signupGrant: number
  modelCount: number
}) {
  const title = fill(section.title ?? 'Your first shot is {credits} credits away', signupGrant)
  const highlightRaw = configString(section.config, 'highlight')
  const highlight = highlightRaw ? fill(highlightRaw, signupGrant) : null
  const at = highlight ? title.indexOf(highlight) : -1

  const primaryLabel = isSignedIn
    ? (configString(section.config, 'signed_in_cta_label') ?? 'Open the composer')
    : (section.ctaLabel ?? 'Create your account')
  const primaryHref = isSignedIn
    ? (configString(section.config, 'signed_in_cta_href') ?? '/create')
    : (section.ctaHref ?? '/sign-up')

  const secondaryLabel = isSignedIn
    ? (configString(section.config, 'secondary_cta_label') ?? 'Connect your API keys')
    : 'Sign in'
  const secondaryHref = isSignedIn
    ? (configString(section.config, 'secondary_cta_href') ?? '/settings/keys')
    : '/sign-in'

  return (
    <section className="relative overflow-hidden border-y border-border/70 py-24 sm:py-32">
      <div className="light-wash pointer-events-none absolute inset-0 rotate-180" aria-hidden />
      <div className="blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          {section.eyebrow && <p className="eyebrow text-brand">{section.eyebrow}</p>}

          <h2 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl">
            {at >= 0 && highlight ? (
              <>
                {title.slice(0, at)}
                <span className="relative whitespace-nowrap">
                  <span className="relative z-10 tabular-nums">{highlight}</span>
                  <span
                    className="absolute inset-x-0 bottom-[0.06em] h-[0.2em] bg-primary/25"
                    aria-hidden
                  />
                </span>
                {title.slice(at + highlight.length)}
              </>
            ) : (
              title
            )}
          </h2>

          {section.lead && (
            <p className="mx-auto mt-5 max-w-lg text-pretty text-[15px] leading-relaxed text-muted-foreground">
              {section.lead} {modelCount} models are available on day one.
            </p>
          )}

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href={secondaryHref}>
                <KeyRound className="size-4" aria-hidden />
                {secondaryLabel}
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
