import { ArrowRight, Cpu, Film, MessageSquareText } from 'lucide-react'

import { Reveal } from '@/components/marketing/reveal'

/**
 * Prompt → AI model → result.
 *
 * Three nodes with connectors between them, laid out horizontally on desktop
 * and vertically on mobile — where the arrows rotate rather than disappear,
 * because the arrows are the content here. A flow diagram whose direction
 * indicators vanish at the breakpoint is three unrelated boxes.
 */

const NODES = [
  {
    icon: MessageSquareText,
    kicker: 'Prompt',
    title: 'Say what you want',
    body: 'A sentence and a preset. The preset adds the camera language and the negative prompt that make the move read on screen.',
    sample: '"a lone figure on a wet rooftop, neon behind her"',
  },
  {
    icon: Cpu,
    kicker: 'AI model',
    title: 'Routed to the right engine',
    body: 'The composer picks the model, the router picks the provider and the key. Your own key wins when you have connected one.',
    sample: 'Motion Cine · Wan 2.2 · 16:9 · 5s · seed 41273',
  },
  {
    icon: Film,
    kicker: 'Result',
    title: 'A shot, not a settings panel',
    body: 'It streams from queued to rendering to playing. Download it, publish it, or remix it with one value changed.',
    sample: 'shot-04.mp4 · 1920×1080 · ready in 62s',
  },
] as const

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 border-t border-border/60 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Prompt, model, result
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Three moves between an idea and a finished shot. Everything else the platform does
              is in service of not adding a fourth.
            </p>
          </div>
        </Reveal>

        <ol className="mt-14 flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
          {NODES.map((node, index) => {
            const Icon = node.icon
            const last = index === NODES.length - 1

            return (
              <li key={node.kicker} className="contents">
                <Reveal delay={index * 0.1} className="flex-1">
                  <div className="h-full rounded-2xl border border-border bg-card p-6">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
                      <Icon className="size-4 text-brand" aria-hidden />
                    </span>

                    <p className="mt-4 font-mono text-xs uppercase tracking-wider text-brand">
                      {node.kicker}
                    </p>
                    <h3 className="mt-1 text-lg font-medium">{node.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {node.body}
                    </p>

                    <p className="mt-4 truncate rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {node.sample}
                    </p>
                  </div>
                </Reveal>

                {!last && (
                  <span
                    className="flex shrink-0 justify-center text-muted-foreground lg:px-2"
                    aria-hidden
                  >
                    <ArrowRight className="size-5 rotate-90 lg:rotate-0" />
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
