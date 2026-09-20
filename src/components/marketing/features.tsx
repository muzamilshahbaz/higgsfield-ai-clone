import {
  Film,
  FolderOpen,
  KeyRound,
  Layers,
  Sparkles,
  UserRoundCheck,
  Wand2,
  Zap,
} from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'
import { PLATFORM_FEATURES } from '@/lib/marketing/showcase'

/**
 * Features, as a bento grid.
 *
 * The platform capabilities the product leads on get wide cells; the studio
 * mechanics under them get a uniform row. A single six-up grid of equal boxes
 * says every one of these matters the same amount, which is not true and
 * reads as filler.
 *
 * The copy lives in lib/marketing/showcase.ts so the icons — which are a
 * rendering concern — stay here and out of the content file.
 */

const FEATURE_ICONS = [Film, Wand2, UserRoundCheck, Layers, Sparkles, KeyRound] as const

const STUDIO_FEATURES = [
  {
    icon: Zap,
    title: 'Live job feed',
    body: 'Queue as many shots as your credits allow. Cards stream from queued to rendering to playing with no refresh.',
  },
  {
    icon: FolderOpen,
    title: 'Projects and library',
    body: 'Shots land in projects, assets stay downloadable, and every generation keeps the prompt, preset and seed that made it.',
  },
  {
    icon: Sparkles,
    title: 'Remix anything',
    body: 'See a shot in Explore you like? Remix pulls its preset and parameters into your composer so you can make it yours.',
  },
] as const

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-24 border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A studio, not a prompt box
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              The model is the easy part. Everything around it — the presets, the queue, the
              library, the credits, the keys — is what turns a demo into a tool you keep open.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PLATFORM_FEATURES.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] ?? Sparkles

            return (
              <Reveal
                key={feature.title}
                delay={index * 0.05}
                className={feature.span || undefined}
              >
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-7 transition-colors hover:border-muted">
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/10 opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    aria-hidden
                  />

                  <Icon className="relative size-5 text-brand" aria-hidden />
                  <h3 className="relative mt-4 text-base font-medium">{feature.title}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              </Reveal>
            )
          })}
        </div>

        <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {STUDIO_FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.05}>
              <div className="h-full bg-background p-7 transition-colors hover:bg-surface">
                <feature.icon className="size-5 text-accent" aria-hidden />
                <h3 className="mt-4 text-[15px] font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
