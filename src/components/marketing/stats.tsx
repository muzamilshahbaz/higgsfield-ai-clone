// The catalogue file, not the database: this is a count on a server-rendered
// marketing line, and it should not read zero because Supabase is unreachable.
import presetCatalogue from '../../../data/presets.json'

import { Reveal } from '@/components/marketing/reveal'
import { PROVIDERS } from '@/lib/ai/catalogue'
import { MODELS } from '@/lib/ai/registry'
import { SIGNUP_CREDIT_GRANT } from '@/lib/constants'

/**
 * The numbers band, directly under the hero.
 *
 * What it is not: a wall of customer logos. This is an independent build with
 * no customers, and a row of borrowed brand marks under the words "trusted by"
 * is the one thing on a landing page that is straightforwardly a lie. So the
 * band does the job that section does — establishing that something real is
 * behind the pitch — with figures counted from the catalogue at render time and
 * an honest statement of what the product runs on.
 *
 * Every number here is derived. There is no literal in this file that a reader
 * could discover was out of date.
 */

const READY_PROVIDERS = PROVIDERS.filter((provider) => provider.generationReady)

const STATS = [
  { value: String(MODELS.length), label: 'Open models', detail: 'image and video' },
  { value: String(presetCatalogue.length), label: 'Presets', detail: 'camera moves and styles' },
  { value: String(READY_PROVIDERS.length), label: 'Providers', detail: 'bring your own key' },
  {
    value: String(SIGNUP_CREDIT_GRANT),
    label: 'Credits on signup',
    detail: 'no card required',
  },
] as const

export function Stats() {
  return (
    <section className="relative py-14 sm:py-16" aria-label="By the numbers">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          {/*
            A gap-px grid over a border-coloured background, so the dividers
            between cells are the background showing through rather than eight
            border declarations that have to agree with each other about which
            edge to draw.
          */}
          <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-background px-5 py-6 sm:px-6">
                <dd className="font-display text-4xl font-semibold tabular-nums leading-none">
                  {stat.value}
                </dd>
                <dt className="mt-3 text-sm font-medium">{stat.label}</dt>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.detail}</p>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-8 flex flex-col items-center gap-x-6 gap-y-3 sm:flex-row sm:justify-center">
            <p className="eyebrow text-muted-foreground">Runs on</p>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {READY_PROVIDERS.map((provider) => (
                <li key={provider.id} className="text-sm font-medium text-foreground/90">
                  {provider.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Every model open-weight, every licence permissive.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
